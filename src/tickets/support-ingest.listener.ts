import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBus, type EventEnvelope } from '@nola-studio/sdk';
import { NolaClientService } from '@nola-hq/nola-sdk';
import { TicketsService } from './tickets.service';
import type { TicketCategory, TicketPriority } from './ticket.entity';

const CATEGORIES: TicketCategory[] = [
  'technical',
  'billing',
  'account',
  'feature',
  'other',
];
const PRIORITIES: TicketPriority[] = ['P1', 'P2', 'P3'];

/** Wire shape published by the kelasi gateway on
 * `nola.events.kelasi.support.requested`. Everything is best-effort: a
 * malformed payload is dropped (acked) rather than retried forever. */
interface SupportRequestPayload {
  /** School tenant id (or org id) the owner is writing about. */
  tenant?: string;
  /** Reply-to — the owner's email. */
  contact?: string;
  subject?: string;
  message?: string;
  category?: string;
  priority?: string;
  /** e.g. 'kelasi-owner-app'. */
  source?: string;
  meta?: {
    orgName?: string;
    schoolName?: string;
    role?: string;
    appVersion?: string;
    platform?: string;
    personId?: string;
  };
}

/**
 * Turns owner support requests from the Kelasi apps into HQ tickets.
 *
 * Flow:
 *   kelasi-gateway  POST /api/owner/support
 *     → NolaEventsService.emit('kelasi.support.requested', payload)
 *       → nola.events.kelasi.support.requested  (JetStream, stream NOLA_EVENTS)
 *         → THIS listener  → TicketsService.create(...)  → ticket (status=open)
 *
 * Consumed over JetStream (EventBus.consume) — NOT raw core-NATS subscribe:
 * the `nola` user has no core `sub` permission on the nola.events.* space
 * (only the JetStream consumer API is granted), so a raw subscription would
 * trigger a fatal PERMISSIONS_VIOLATION. This mirrors LogsIngestListener /
 * IncidentAlertListener.
 *
 * Unlike the logs ingester, the consumer is DURABLE and is NOT deleted at
 * boot: a support request must never be lost across an HQ restart, so we
 * accept at-least-once delivery (a rare duplicate ticket on crash-after-create
 * is preferable to a dropped request). Volume is low (owner-initiated).
 *
 * Disable with NOLA_HQ_SUPPORT_INGEST=false.
 */
@Injectable()
export class SupportIngestListener implements OnApplicationBootstrap {
  private readonly logger = new Logger(SupportIngestListener.name);
  private eventBus: EventBus | null = null;
  private readonly enabled: boolean;

  private static readonly STREAM = 'NOLA_EVENTS';
  private static readonly CONSUMER = 'nola-hq-support-ingest';
  private static readonly FILTER = 'nola.events.kelasi.support.requested';

  constructor(
    private readonly nolaClient: NolaClientService,
    private readonly tickets: TicketsService,
    private readonly config: ConfigService,
  ) {
    this.enabled =
      (this.config.get<string>('NOLA_HQ_SUPPORT_INGEST') ?? 'true') !== 'false';
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) {
      this.logger.log(
        'Support ingestion disabled (NOLA_HQ_SUPPORT_INGEST=false)',
      );
      return;
    }
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    // NolaClient bootstrap is fire-and-forget; spin until it's ready (max
    // ~2 min) so we don't crash app bootstrap if NATS is slow to come up.
    for (let i = 0; i < 30 && !this.nolaClient.isReady(); i += 1) {
      await new Promise((r) => setTimeout(r, 4_000));
    }
    if (!this.nolaClient.isReady()) {
      this.logger.warn(
        'NolaClient not ready after 30 attempts — support ingestion disabled',
      );
      return;
    }

    try {
      this.eventBus = new EventBus(this.nolaClient.getClient());
      await this.eventBus.init();
      await this.eventBus.consume<SupportRequestPayload>(
        SupportIngestListener.STREAM,
        SupportIngestListener.CONSUMER,
        SupportIngestListener.FILTER,
        (env) => this.handle(env),
      );
      this.logger.log(
        `Ingesting support requests from ${SupportIngestListener.FILTER}`,
      );
    } catch (err: unknown) {
      this.logger.error(
        `Support ingestion init failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async handle(
    env: EventEnvelope<SupportRequestPayload>,
  ): Promise<void> {
    const p = env.payload ?? {};
    const subject = (p.subject ?? '').trim();
    const message = (p.message ?? '').trim();
    const contact = (p.contact ?? '').trim();
    const tenant = (p.tenant ?? '').trim();

    // A request with no usable content is dropped (acked) — retrying it would
    // never succeed and would block the consumer.
    if (!subject || !message || !contact || !tenant) {
      this.logger.warn(
        `Dropping malformed support request (subject=${!!subject} message=${!!message} contact=${!!contact} tenant=${!!tenant})`,
      );
      return;
    }

    const category = CATEGORIES.includes(p.category as TicketCategory)
      ? (p.category as TicketCategory)
      : 'other';
    const priority = PRIORITIES.includes(p.priority as TicketPriority)
      ? (p.priority as TicketPriority)
      : 'P3';

    await this.tickets.create({
      tenant,
      subject,
      title: subject,
      body: this.composeBody(message, p),
      contact,
      priority,
      status: 'open',
      assignee: 'unassigned',
      category,
      source: p.source ?? 'kelasi',
    });

    this.logger.log(
      `Support ticket created (tenant=${tenant} category=${category} priority=${priority})`,
    );
  }

  /** Append a human-readable context footer so HQ agents see the school,
   * app version and platform without leaving the ticket. */
  private composeBody(message: string, p: SupportRequestPayload): string {
    const m = p.meta ?? {};
    const lines: string[] = [];
    if (m.schoolName) lines.push(`École : ${m.schoolName}`);
    if (m.orgName) lines.push(`Organisation : ${m.orgName}`);
    if (m.role) lines.push(`Rôle : ${m.role}`);
    if (m.appVersion) lines.push(`Version app : ${m.appVersion}`);
    if (m.platform) lines.push(`Plateforme : ${m.platform}`);
    if (m.personId) lines.push(`Person ID : ${m.personId}`);
    if (lines.length === 0) return message;
    return `${message}\n\n— Contexte —\n${lines.join('\n')}`;
  }
}
