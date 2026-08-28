import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBus, type EventEnvelope } from '@nola-studio/sdk';
import { NolaClientService } from '@nola-hq/nola-sdk';
import { LogsService } from './logs.service';
import type { LogLevel } from './log.entity';

type Category = 'incident' | 'iam' | 'audit';

interface Source {
  category: Category;
  /** JetStream subject filter — must be covered by the stream's subjects. */
  filter: string;
  /** Durable consumer name, deleted + recreated at boot for live-only. */
  consumer: string;
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
 * Consumed over JetStream (EventBus.consume) — NOT raw core-NATS subscribe.
 * The `nola` user lacks core `sub` permission on the health/audit subjects
 * (only the JetStream consumer API is granted), so a raw subscription
 * triggers a fatal PERMISSIONS_VIOLATION. This mirrors IncidentAlertListener,
 * which consumes the same incident stream successfully.
 *
 * Each consumer is deleted at boot then recreated so we only ingest events
 * that arrive while HQ is up — a restart never re-floods the table with the
 * full stream history. Each source is wired independently: if one filter
 * isn't in the stream or its perms differ, it logs a warning and the others
 * keep working. Audit *successes* are dropped (the Audit log screen already
 * covers them); only failures land here.
 *
 * Disable with NOLA_HQ_LOG_INGEST=false.
 */
@Injectable()
export class LogsIngestListener
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(LogsIngestListener.name);
  private eventBus: EventBus | null = null;
  private readonly enabled: boolean;

  private static readonly STREAM = 'NOLA_HQ_EVENTS';
  private static readonly SOURCES: Source[] = [
    {
      category: 'incident',
      filter: 'nola.events.nola.health.incident.>',
      consumer: 'nola-hq-logs-incident',
    },
    {
      category: 'iam',
      filter: 'nola.events.iam.>',
      consumer: 'nola-hq-logs-iam',
    },
    {
      category: 'audit',
      filter: 'nola.events.nola.audit.hq.*',
      consumer: 'nola-hq-logs-audit',
    },
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
    void this.bootstrap();
  }

  onModuleDestroy(): void {
    // JetStream consumers are reaped by the SDK on NATS drain — nothing to
    // do here. Method kept for symmetry with the rest of the module.
  }

  private async bootstrap(): Promise<void> {
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
      this.eventBus = new EventBus(this.nolaClient.getClient());
      await this.eventBus.init();

      await this.eventBus.ensureStream({
        name: LogsIngestListener.STREAM,
        subjects: LogsIngestListener.SOURCES.map((s) => s.filter),
        max_age: 7 * 24 * 60 * 60 * 1_000_000_000, // 7d retention
      });
    } catch (err: unknown) {
      this.logger.error(
        `CRITICAL: Log ingestion stream init failed for ${LogsIngestListener.STREAM}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }

    const jsm = await this.nolaClient
      .getClient()
      .getConnection()
      .jetstreamManager()
      .catch(() => null);

    for (const src of LogsIngestListener.SOURCES) {
      try {
        // Drop any persisted consumer so we restart from "new" and don't
        // replay the whole stream history into the logs table on reboot.
        if (jsm) {
          await jsm.consumers
            .delete(LogsIngestListener.STREAM, src.consumer)
            .catch(() => undefined);
        }
        await this.eventBus.consume<Record<string, unknown>>(
          LogsIngestListener.STREAM,
          src.consumer,
          src.filter,
          (env) => this.handle(src.category, env),
        );
        this.logger.log(`Ingesting logs from ${src.filter} (stream=${LogsIngestListener.STREAM}, consumer=${src.consumer})`);
      } catch (err: unknown) {
        this.logger.error(
          `CRITICAL: Log ingestion consumer bind failed for ${src.filter} (consumer=${src.consumer}, stream=${LogsIngestListener.STREAM}): ${err instanceof Error ? err.message : String(err)}`,
        );
        throw err;
      }
    }
  }

  private async handle(
    category: Category,
    env: EventEnvelope<Record<string, unknown>>,
  ): Promise<void> {
    const line = this.toLogLine(category, env);
    if (!line) return; // not log-worthy (e.g. a successful audit event)
    await this.logs.ingest(line.svc, line.lvl, line.msg);
  }

  private toLogLine(
    category: Category,
    env: EventEnvelope<Record<string, unknown>>,
  ): { svc: string; lvl: LogLevel; msg: string } | null {
    const p = env.payload ?? {};
    const str = (k: string): string | undefined =>
      typeof p[k] === 'string' ? (p[k] as string) : undefined;

    if (category === 'incident') {
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

    if (category === 'iam') {
      const event = env.event || 'event';
      const name = str('name');
      const orgId = str('orgId');
      const detail = name ?? (orgId ? `${orgId.slice(0, 8)}…` : undefined);
      return {
        svc: 'nola-iam',
        lvl: 'INFO',
        msg: `${event}${detail ? ` — ${detail}` : ''}`,
      };
    }

    // audit — only failures are log-worthy; the Audit log screen already
    // lists every successful mutation.
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
}
