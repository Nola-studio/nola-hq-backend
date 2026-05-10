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
}
