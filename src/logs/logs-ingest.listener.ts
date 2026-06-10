import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JSONCodec } from 'nats';
import { NolaClientService } from '@nola-hq/nola-sdk';
import { LogsService } from './logs.service';
import type { LogLevel } from './log.entity';

interface BaseEnvelope {
  event?: string;
  payload?: Record<string, unknown>;
  metadata?: { issuedBy?: string; issuedAt?: string };
  // Some emitters publish the payload at the top level. Tolerate both.
  [key: string]: unknown;
}

/**
 * Feeds the "Logs & audit unifiés" screen.
 *
 * The `logs` table has no producer of its own — `POST /api/v1/logs` exists
 * but no service calls it, so the screen was always empty. This listener
 * turns the platform event streams HQ already receives into structured log
 * lines so the unified view shows live cross-service activity:
 *
 *   nola.events.nola.health.incident.>   → service up/down (WARN/ERROR/INFO)
 *   nola.events.iam.>                    → identity changes (INFO)
 *   nola.events.nola.audit.hq.*          → failed HQ mutations only (ERROR)
 *
 * Uses raw core-NATS subscriptions (live-only, no JetStream replay) — same
 * approach as IamEventsListener — so a restart never re-floods the table
 * with historical events. Audit *successes* are intentionally dropped: the
 * Audit log screen already covers them; here we only surface failures.
 *
 * Disable with NOLA_HQ_LOG_INGEST=false.
 */
@Injectable()
export class LogsIngestListener
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(LogsIngestListener.name);
  private readonly jc = JSONCodec();
  private readonly subscriptions: Array<{ drain: () => Promise<void> }> = [];
  private readonly enabled: boolean;

  private static readonly SUBJECTS = [
    'nola.events.nola.health.incident.>',
    'nola.events.iam.>',
    'nola.events.nola.audit.hq.*',
  ];

  constructor(
    private readonly nolaClient: NolaClientService,
    private readonly logs: LogsService,
    private readonly config: ConfigService,
  ) {
    this.enabled =
      (this.config.get<string>('NOLA_HQ_LOG_INGEST') ?? 'true') !== 'false';
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('Log ingestion disabled (NOLA_HQ_LOG_INGEST=false)');
      return;
    }

    // NolaClient bootstrap is fire-and-forget; spin until it's ready (max
    // ~2 min) so we don't crash the bootstrap if NATS is slow to come up.
    for (let i = 0; i < 30 && !this.nolaClient.isReady(); i += 1) {
      await new Promise((r) => setTimeout(r, 4_000));
    }
    if (!this.nolaClient.isReady()) {
      this.logger.warn(
        'NolaClient not ready after 30 attempts — log ingestion disabled',
      );
      return;
    }

    try {
      const nc = this.nolaClient.getClient().getConnection();
      for (const subject of LogsIngestListener.SUBJECTS) {
        const sub = nc.subscribe(subject);
        this.subscriptions.push(
          sub as unknown as { drain: () => Promise<void> },
        );
        (async () => {
          for await (const msg of sub) {
            try {
              const decoded = this.jc.decode(msg.data) as BaseEnvelope;
              await this.handleEvent(msg.subject, decoded);
            } catch (err: unknown) {
              this.logger.warn(
                `Failed to ingest ${msg.subject}: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }
        })();
      }
      this.logger.log(
        `Ingesting logs from ${LogsIngestListener.SUBJECTS.join(', ')}`,
      );
    } catch (err: unknown) {
      this.logger.error(
        `Failed to subscribe for log ingestion: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      this.subscriptions.map((s) => s.drain().catch(() => undefined)),
    );
  }

  private async handleEvent(
    subject: string,
    envelope: BaseEnvelope,
  ): Promise<void> {
    // SDK EventBus wraps payloads in `{event, payload, metadata}`; direct
    // nc.publish skips the wrap. Pick whichever shape is present.
    const payload: Record<string, unknown> =
      (envelope.payload as Record<string, unknown>) ?? envelope ?? {};

    const line = this.toLogLine(subject, payload);
    if (!line) return; // not log-worthy (e.g. a successful audit event)
    await this.logs.ingest(line.svc, line.lvl, line.msg);
  }

  private toLogLine(
    subject: string,
    p: Record<string, unknown>,
  ): { svc: string; lvl: LogLevel; msg: string } | null {
    const str = (k: string): string | undefined =>
      typeof p[k] === 'string' ? (p[k] as string) : undefined;

    if (subject.startsWith('nola.events.nola.health.incident.')) {
      const svc = str('serviceId') ?? str('serviceName') ?? 'unknown-service';
      const state = str('state'); // 'open' | 'closed'
      const severity = str('severity'); // 'P1' | 'P2' | 'P3'
      const reason = str('reason') ?? 'incident';
      if (state === 'closed') {
        return { svc, lvl: 'INFO', msg: `Incident résolu — ${reason}` };
      }
      return {
        svc,
        lvl: severity === 'P1' ? 'ERROR' : 'WARN',
        msg: `Incident ${severity ?? ''} ouvert — ${reason}`.trim(),
      };
    }

    if (subject.startsWith('nola.events.iam.')) {
      const tail = subject.replace(/^nola\.events\.iam\./, '');
      const name = str('name');
      const orgId = str('orgId');
      const detail =
        name ?? (orgId ? `${orgId.slice(0, 8)}…` : undefined);
      return {
        svc: 'nola-iam',
        lvl: 'INFO',
        msg: `${tail}${detail ? ` — ${detail}` : ''}`,
      };
    }

    if (subject.startsWith('nola.events.nola.audit.hq.')) {
      // Only failures are log-worthy; the Audit log screen already lists
      // every successful mutation.
      if (str('status') !== 'error') return null;
      const action = str('action') ?? 'requête';
      const code = p.errorCode !== undefined ? String(p.errorCode) : 'ERR';
      const detail = str('errorMessage');
      return {
        svc: 'nola-hq',
        lvl: 'ERROR',
        msg: `${action} → ${code}${detail ? ` ${detail}` : ''}`,
      };
    }

    return null;
  }
}
