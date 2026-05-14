import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { JSONCodec } from 'nats';
import { NolaClientService } from '@nola-hq/nola-sdk';
import { ActivityService } from '../activity/activity.service';

interface BaseEnvelope {
  event?: string;
  payload?: Record<string, unknown>;
  metadata?: { issuedBy?: string; issuedAt?: string };
  // Some emitters publish the payload at the top level. Tolerate both.
  [key: string]: unknown;
}

/**
 * Subscribes to `nola.events.iam.>` and writes a row into the activity
 * timeline for each event. nola-iam emits:
 *   - org.created / org.suspended / org.reactivated
 *   - membership.created / membership.role_changed / membership.revoked /
 *     membership.regranted
 *
 * Mapped to the 'tech' category — the activity feed is the meta-platform
 * audit trail; finer categorization would require schema changes (adding
 * an 'iam' category to ActivityCategory).
 */
@Injectable()
export class IamEventsListener
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(IamEventsListener.name);
  private readonly jc = JSONCodec();
  private subscription: { drain: () => Promise<void> } | null = null;

  constructor(
    private readonly nolaClient: NolaClientService,
    private readonly activity: ActivityService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // NolaClient bootstrap is fire-and-forget; spin until it's ready (max
    // ~2 min) so we don't crash the bootstrap if NATS is slow to come up.
    for (let i = 0; i < 30 && !this.nolaClient.isReady(); i += 1) {
      await new Promise((r) => setTimeout(r, 4_000));
    }
    if (!this.nolaClient.isReady()) {
      this.logger.warn(
        'NolaClient not ready after 30 attempts — iam events listener disabled',
      );
      return;
    }

    try {
      const nc = this.nolaClient.getClient().getConnection();
      const sub = nc.subscribe('nola.events.iam.>');
      this.subscription = sub as unknown as { drain: () => Promise<void> };

      (async () => {
        for await (const msg of sub) {
          try {
            const decoded = this.jc.decode(msg.data) as BaseEnvelope;
            await this.handleEvent(msg.subject, decoded);
          } catch (err: unknown) {
            this.logger.warn(
              `Failed to handle ${msg.subject}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      })();

      this.logger.log('Listening on nola.events.iam.>');
    } catch (err: unknown) {
      this.logger.error(
        `Failed to subscribe to nola.events.iam.>: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscription) {
      await this.subscription.drain().catch(() => undefined);
    }
  }

  private async handleEvent(
    subject: string,
    envelope: BaseEnvelope,
  ): Promise<void> {
    // SDK EventBus typically wraps payloads in `{event, payload, metadata}`;
    // direct nc.publish skips the wrap. Pick whichever shape is present.
    const payload: Record<string, unknown> =
      (envelope.payload as Record<string, unknown>) ?? envelope ?? {};
    const issuedBy = envelope.metadata?.issuedBy ?? 'nola-iam';

    const tail = subject.replace(/^nola\.events\.iam\./, '');
    const { text, ref } = this.describe(tail, payload);

    await this.activity.record({
      cat: 'tech',
      actor: issuedBy,
      text,
      ref,
    });
  }

  private describe(
    eventTail: string,
    payload: Record<string, unknown>,
  ): { text: string; ref: string | null } {
    // Pull common keys with permissive types — the payload shape varies per
    // event but `orgId`, `name`, `personId`, `platformRole`, `reason` cover
    // the bulk of what we need.
    const orgId = (payload.orgId as string | undefined) ?? null;
    const name = (payload.name as string | undefined) ?? null;
    const personId = (payload.personId as string | undefined) ?? null;
    const role = (payload.platformRole as string | undefined) ?? null;
    const reason = (payload.reason as string | undefined) ?? null;

    switch (eventTail) {
      case 'org.created':
        return {
          text: `Organisation créée${name ? ` — ${name}` : ''}${orgId ? ` (${orgId.slice(0, 8)}…)` : ''}`,
          ref: orgId,
        };
      case 'org.suspended':
        return {
          text: `Organisation suspendue${orgId ? ` ${orgId.slice(0, 8)}…` : ''}${reason ? ` — ${reason}` : ''}`,
          ref: orgId,
        };
      case 'org.reactivated':
        return {
          text: `Organisation réactivée${orgId ? ` ${orgId.slice(0, 8)}…` : ''}`,
          ref: orgId,
        };
      case 'membership.created':
        return {
          text: `Membership créé${role ? ` (${role})` : ''}${orgId ? ` sur org ${orgId.slice(0, 8)}…` : ''}`,
          ref: orgId,
        };
      case 'membership.role_changed':
        return {
          text: `Rôle de membership changé${role ? ` → ${role}` : ''}${personId ? ` (person ${personId.slice(0, 8)}…)` : ''}`,
          ref: orgId,
        };
      case 'membership.revoked':
        return {
          text: `Membership révoqué${personId ? ` — person ${personId.slice(0, 8)}…` : ''}${reason ? ` (${reason})` : ''}`,
          ref: orgId,
        };
      case 'membership.regranted':
        return {
          text: `Membership ré-accordé${personId ? ` — person ${personId.slice(0, 8)}…` : ''}`,
          ref: orgId,
        };
      default:
        return {
          text: `IAM ${eventTail}`,
          ref: orgId,
        };
    }
  }
}
