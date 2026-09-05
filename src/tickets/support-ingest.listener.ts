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

/** Wire shape published by the kelasi/yekoli gateway on
 * `nola.events.kelasi.support.requested` (variante historique) et
 * `nola.events.yekoli.support.requested` (variante post-rename). Everything
 * is best-effort: a malformed payload is dropped (acked) rather than
 * retried forever. */
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
    /** Real email when the sender has one (web matricule users may not). */
    contactEmail?: string;
    /**
     * Vantelis IT's own upstream commitment (e.g. '15 min'), computed
     * against their own business-hours config — display/context only.
     * HQ's own `sla_policies` (business unit × priority) governs alerting;
     * this is never parsed or compared against it. Absent from
     * kelasi/yekoli payloads.
     */
    slaTarget?: string;
    /** ISO timestamp matching `slaTarget`, same source, same caveat. */
    dueAt?: string;
  };
}

/**
 * Turns owner support requests from the Kelasi/Yekoli apps into HQ tickets.
 *
 * Flow:
 *   kelasi-gateway  POST /api/owner/support
 *     → NolaEventsService.emit('<app>.support.requested', payload)
 *       → nola.events.{kelasi|yekoli}.support.requested  (JetStream, NOLA_EVENTS)
 *         → THIS listener  → TicketsService.create(...)  → ticket (status=open)
 *
 * Rename Kelasi → Yekoli (Phase 6a) : le producteur va renommer le segment
 * app de ses sujets (`kelasi` → `yekoli`). Pendant la transition, ce
 * listener consomme LES DEUX variantes — même handler, mêmes garanties.
 * Chaque variante a son consumer durable : `EventBus.consume` binde un
 * durable existant TEL QUEL (le filtre passé n'est appliqué qu'à la
 * création), donc changer le filtre du durable historique serait sans effet
 * sur les environnements déjà déployés. Les deux sujets sont disjoints et le
 * producteur ne publie chaque évènement que sur UNE variante : pas de
 * doublon inter-consumers. Une fois le producteur 100 % yekoli (Phase 8),
 * le durable kelasi pourra être retiré.
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

  /**
   * Le flux JetStream d'où viennent les évènements.
   *
   * Configurable parce qu'il n'appartient pas toujours à HQ : sur un compte
   * NATS où un flux de plateforme couvre déjà `nola.events.>`, en créer un
   * second est refusé — « subjects overlap with an existing stream ». Là, HQ
   * doit consommer celui qui existe (`NOLA_HQ_EVENTS_STREAM=NOLA_EVENTS`)
   * plutôt que réclamer le sien.
   */
  private readonly stream: string;
  private static readonly DEFAULT_STREAM = 'NOLA_HQ_EVENTS';
  private static readonly STREAM_SUBJECTS = ['nola.events.>'];
  /**
   * Un consumer durable par sujet produit (voir doc de classe). Le nom
   * historique reste lié au sujet kelasi pour préserver l'état
   * (curseur/backlog) du durable déjà déployé.
   *
   * `businessUnitCode` est déclaré ici, par source — jamais dérivé du
   * sujet, de `source`, ou d'une normalisation du nom d'app. C'est le
   * seul endroit qui décide de la marque d'un ticket ingéré ; un sujet
   * ajouté sans ce champ ne compile pas (le champ est requis sur le
   * type), plutôt que de silencieusement retomber sur un défaut.
   */
  static readonly SOURCES: ReadonlyArray<{
    consumer: string;
    filter: string;
    businessUnitCode: string;
  }> = [
    {
      consumer: 'nola-hq-support-ingest',
      filter: 'nola.events.kelasi.support.requested',
      businessUnitCode: 'khi-lab',
    },
    {
      consumer: 'nola-hq-support-ingest-yekoli',
      filter: 'nola.events.yekoli.support.requested',
      businessUnitCode: 'khi-lab',
    },
    {
      consumer: 'nola-hq-support-ingest-vantelisit',
      filter: 'nola.events.vantelisit.support.requested',
      businessUnitCode: 'vantelis-it',
    },
  ];

  constructor(
    private readonly nolaClient: NolaClientService,
    private readonly tickets: TicketsService,
    private readonly config: ConfigService,
  ) {
    this.enabled =
      (this.config.get<string>('NOLA_HQ_SUPPORT_INGEST') ?? 'true') !== 'false';
    this.stream =
      this.config.get<string>('NOLA_HQ_EVENTS_STREAM') ??
      SupportIngestListener.DEFAULT_STREAM;
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

    } catch (err: unknown) {
      this.logger.error(
        `CRITICAL: Support ingestion bus init failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    /**
     * Créer le flux est une commodité, pas une condition.
     *
     * Un échec ici ne dit pas que rien ne marchera : le flux peut très bien
     * exister, tenu par la plateforme, et notre `streams.add` être refusé
     * précisément parce qu'il est déjà là sous un autre nom. On le signale et
     * on tente quand même de consommer — c'est le binding du consumer qui
     * tranche.
     *
     * Ce qu'on ne fait plus, c'est mourir. Cette exception remontait d'un
     * `void this.bootstrap()` : rejet non traité, et Node arrête le
     * processus. Nolaa HQ tout entier — tickets, factures, backlog — tombait
     * parce qu'une ingestion de support ne pouvait pas déclarer son flux.
     */
    try {
      await this.eventBus.ensureStream({
        name: this.stream,
        subjects: SupportIngestListener.STREAM_SUBJECTS,
        max_age: 30 * 24 * 60 * 60 * 1_000_000_000,
      });
    } catch (err: unknown) {
      this.logger.warn(
        `Support ingestion could not declare stream ${this.stream} ` +
          `(${err instanceof Error ? err.message : String(err)}) — ` +
          "si un flux de plateforme couvre déjà « nola.events.> », pointez HQ dessus " +
          'avec NOLA_HQ_EVENTS_STREAM. Tentative de consommation malgré tout.',
      );
    }

    for (const { consumer, filter, businessUnitCode } of SupportIngestListener.SOURCES) {
      try {
        await this.eventBus.consume<SupportRequestPayload>(
          this.stream,
          consumer,
          filter,
          (env) => this.handle(env, businessUnitCode),
        );
        this.logger.log(
          `Ingesting support requests from ${filter} (stream=${this.stream}, consumer=${consumer})`,
        );
      } catch (err: unknown) {
        // Une source qui ne se lie pas ne doit emporter ni les autres ni
        // l'application : les demandes de support restent dans le flux, et
        // le prochain démarrage les reprendra.
        this.logger.error(
          `CRITICAL: Support ingestion consumer bind failed for ${filter} (consumer=${consumer}, stream=${this.stream}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async handle(
    env: EventEnvelope<SupportRequestPayload>,
    businessUnitCode: string,
  ): Promise<void> {
    const p = env.payload ?? {};
    const subject = (p.subject ?? '').trim();
    const message = (p.message ?? '').trim();
    const tenant = (p.tenant ?? '').trim();
    // `contact` is NOT required to ingest: a web user who logged in by
    // matricule has no email, and dropping their request would lose a real
    // support ticket. Fall back to the email carried in meta, else a marker —
    // the school (tenant) + context footer still let HQ act on it.
    const contact =
      (p.contact ?? '').trim() ||
      (p.meta?.contactEmail ?? '').trim() ||
      'contact inconnu';

    // Only drop when there's genuinely nothing to action — retrying these
    // would never succeed and would block the consumer.
    if (!subject || !message || !tenant) {
      this.logger.warn(
        `Dropping malformed support request (subject=${!!subject} message=${!!message} tenant=${!!tenant})`,
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
      source: p.source ?? 'yekoli',
      businessUnitCode,
      dueAt: p.meta?.dueAt,
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
    // Producteur's own upstream commitment — display only, never HQ's SLA
    // source of truth (that's sla_policies, business unit × priority).
    if (m.slaTarget) lines.push(`Engagement fournisseur : ${m.slaTarget}`);
    if (m.dueAt) lines.push(`Échéance fournisseur : ${m.dueAt}`);
    if (lines.length === 0) return message;
    return `${message}\n\n— Contexte —\n${lines.join('\n')}`;
  }
}
