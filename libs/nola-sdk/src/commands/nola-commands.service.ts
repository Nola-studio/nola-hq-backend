import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nola-studio/sdk';
import type {
  CommandEnvelope,
  CommandResult,
} from '@nola-studio/sdk/commands';
import { NolaClientService } from '../nola-client.service';

export type CommandHandler<TPayload, TResult> = (
  envelope: CommandEnvelope<TPayload>,
) => Promise<CommandResult<TResult>>;

/**
 * Wraps `@nola-studio/sdk` CommandBus. Subjects use the convention
 * `nola.commands.kelasi.<action>` (chap. 4.3.4 — Studio invokes admin
 * actions declared in the manifest via request-reply).
 *
 * Set `NOLA_COMMAND_BUS_DISABLED=true` to skip all NATS subscriptions —
 * useful when running against a Nola Core whose `nats-server.conf` hasn't
 * been updated with the right `subscribe` permissions for this realm
 * (otherwise the SDK loops on PermissionsViolation across reconnects).
 */
@Injectable()
export class NolaCommandsService {
  private readonly logger = new Logger(NolaCommandsService.name);
  private bus: CommandBus | null = null;
  private readonly pending: Array<{
    subject: string;
    handler: CommandHandler<unknown, unknown>;
  }> = [];
  private readonly registered = new Set<string>();
  private flushScheduled = false;
  private readonly disabled = process.env.NOLA_COMMAND_BUS_DISABLED === 'true';

  constructor(private readonly nolaClient: NolaClientService) {
    if (this.disabled) {
      this.logger.warn(
        'NOLA_COMMAND_BUS_DISABLED=true — command bus subscriptions skipped',
      );
    }
  }

  /**
   * Register an async handler for a `nola.commands.kelasi.*` subject.
   * Call from controllers / modules — the subscription is deferred until
   * NolaClient is ready, so it's safe to call before the gateway boots.
   */
  async handle<TPayload, TResult>(
    action: string,
    handler: CommandHandler<TPayload, TResult>,
  ): Promise<void> {
    const subject = `nola.commands.kelasi.${action}`;
    if (this.disabled || this.registered.has(subject)) return;

    if (!this.nolaClient.isReady()) {
      this.pending.push({
        subject,
        handler: handler as CommandHandler<unknown, unknown>,
      });
      this.logger.log(
        `Deferred command handler for "${subject}" (NATS not ready)`,
      );
      this.scheduleFlush();
      return;
    }
    await this.subscribeOne(subject, handler as CommandHandler<unknown, unknown>);
  }

  private scheduleFlush(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    void this.nolaClient.ready().then(() => this.flushDeferred());
  }

  /** No-op if the bootstrap finished without a usable NATS connection. */
  async flushDeferred(): Promise<void> {
    const items = this.pending.splice(0);
    if (items.length === 0) return;
    if (!this.nolaClient.isReady()) {
      this.logger.warn(
        `Cannot flush ${items.length} deferred command handlers — NATS unavailable`,
      );
      return;
    }
    for (const { subject, handler } of items) {
      await this.subscribeOne(subject, handler);
    }
  }

  private async subscribeOne(
    subject: string,
    handler: CommandHandler<unknown, unknown>,
  ): Promise<void> {
    if (this.registered.has(subject)) return;
    try {
      await this.ensureBus();
      await this.bus!.handle(subject, handler);
      this.registered.add(subject);
      this.logger.log(`Listening for command "${subject}"`);
    } catch (err) {
      this.logger.warn(
        `Failed to subscribe to "${subject}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async ensureBus(): Promise<void> {
    if (!this.bus) {
      this.bus = new CommandBus(this.nolaClient.getClient());
    }
  }

  /**
   * Send a NATS request-reply command and return the typed CommandResult.
   * Use for cross-service calls — e.g. `nola.commands.billing.admin.tenant.list`.
   *
   * Throws if the bus is disabled or the NATS connection isn't ready: callers
   * that can degrade gracefully should catch and fall back. Throws on transport
   * error or timeout; non-2xx-equivalent results come back as `{ success:
   * false, error }` and are NOT thrown.
   */
  async send<TPayload, TResult>(
    subject: string,
    payload: TPayload,
    options: {
      issuedBy: string;
      correlationId?: string;
      realm?: string;
      tenantId?: string;
      timeoutMs?: number;
    },
  ): Promise<CommandResult<TResult>> {
    if (this.disabled) {
      throw new Error(`NOLA_COMMAND_BUS_DISABLED — cannot send "${subject}"`);
    }
    if (!this.nolaClient.isReady()) {
      throw new Error(`NolaClient not ready — cannot send "${subject}"`);
    }
    await this.ensureBus();
    const { issuedBy, correlationId, realm, tenantId, timeoutMs } = options;
    return this.bus!.send<TPayload, TResult>(
      subject,
      payload,
      {
        correlationId: correlationId ?? cryptoRandomUuid(),
        issuedBy,
        realm,
        tenantId,
      },
      timeoutMs ?? 5_000,
    );
  }
}

function cryptoRandomUuid(): string {
  // Browser/Node 18+ globally exposes crypto.randomUUID; fall back to Math
  // only if it's truly missing (shouldn't happen on our Node runtimes).
  const c: { randomUUID?: () => string } | undefined =
    (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return Math.random().toString(36).slice(2);
}
