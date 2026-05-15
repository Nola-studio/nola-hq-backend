import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBus } from '@nola-studio/sdk';
import { NolaClientService } from '@nola-hq/nola-sdk';
import type { HealthIncident } from './health.service';

/**
 * Bridges health incident events to email alerts via nola-notify.
 *
 *   nola.events.nola.health.incident.<svc>    (consumer)
 *        │
 *        ▼ filter severity ≥ P2, dedupe by incident id
 *   nola.commands.notify.send                 (publisher → nola-notify)
 *        │
 *        ▼ nola-notify dispatches via SMTP/Mailgun/…
 *   admin@nolaastudio.com
 *
 * Template uses the `_inline` sentinel so we don't need to pre-seed a
 * row in the notify DB. The subject + body are passed through the
 * `variables` map and nola-notify's NotificationsService renders them
 * unchanged.
 *
 * Dedup: a Set of already-notified incident ids is kept in memory.
 * Sufficient for "lite Datadog" — a HQ restart re-opens the
 * notification window briefly but the volume (one alert per real
 * incident) keeps the noise minimal.
 *
 * Disable with NOLA_HQ_INCIDENT_ALERTS=false (env). Override the
 * destination with NOLA_HQ_INCIDENT_EMAIL.
 */
const ALERT_CONSUMER = 'nola-hq-health-alert-bridge';
const HEALTH_STREAM = 'NOLA_EVENTS';
const DEFAULT_RECIPIENT = 'admin@nolaastudio.com';

@Injectable()
export class IncidentAlertListener
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(IncidentAlertListener.name);
  private readonly notifiedIds = new Set<string>();
  private eventBus: EventBus | null = null;
  private enabled = true;
  private recipient = DEFAULT_RECIPIENT;

  constructor(
    private readonly nolaClient: NolaClientService,
    private readonly config: ConfigService,
  ) {
    this.enabled =
      (this.config.get<string>('NOLA_HQ_INCIDENT_ALERTS') ?? 'true') !== 'false';
    this.recipient =
      this.config.get<string>('NOLA_HQ_INCIDENT_EMAIL') ?? DEFAULT_RECIPIENT;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) {
      this.logger.log(
        'Incident alerts disabled (NOLA_HQ_INCIDENT_ALERTS=false)',
      );
      return;
    }
    void this.bootstrap();
  }

  onModuleDestroy(): void {
    // EventBus consumers are reaped by the SDK on NATS drain — nothing
    // to do here. Method kept for symmetry with the rest of the module.
  }

  private async bootstrap(): Promise<void> {
    for (let i = 0; i < 30 && !this.nolaClient.isReady(); i += 1) {
      await new Promise((r) => setTimeout(r, 4_000));
    }
    if (!this.nolaClient.isReady()) {
      this.logger.warn(
        'NolaClient not ready after 30 attempts — incident alerts disabled',
      );
      return;
    }

    try {
      this.eventBus = new EventBus(this.nolaClient.getClient());
      await this.eventBus.init();

      // Delete the consumer at boot so we don't replay the entire
      // history of incidents (which would re-send the email to every
      // already-resolved P2). After boot, we only forward events that
      // arrive while the service is up.
      try {
        const nc = this.nolaClient.getClient().getConnection();
        const jsm = await nc.jetstreamManager();
        await jsm.consumers
          .delete(HEALTH_STREAM, ALERT_CONSUMER)
          .catch(() => undefined);
      } catch {
        // jsm not reachable — proceed; SDK consume() will create the
        // consumer fresh.
      }

      await this.eventBus.consume<HealthIncident>(
        HEALTH_STREAM,
        ALERT_CONSUMER,
        'nola.events.nola.health.incident.>',
        async (env) => {
          if (env.payload) await this.handleIncident(env.payload);
        },
      );
      this.logger.log(
        `Incident alert bridge ready — forwarding P1/P2 to ${this.recipient}`,
      );
    } catch (err) {
      this.logger.error(
        `Incident alert bootstrap failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async handleIncident(inc: HealthIncident): Promise<void> {
    // Only alert on production-impacting severities. P3 is noisy and
    // usually self-resolves.
    if (inc.severity !== 'P1' && inc.severity !== 'P2') return;

    const dedupKey = `${inc.id}:${inc.state}`;
    if (this.notifiedIds.has(dedupKey)) return;
    this.notifiedIds.add(dedupKey);

    const subject =
      inc.state === 'open'
        ? `[${inc.severity}] ${inc.serviceName} ${inc.reason}`
        : `[RÉSOLU ${inc.severity}] ${inc.serviceName} · durée ${this.formatDuration(inc.durationMs)}`;
    const body = renderIncidentBody(inc);

    try {
      await this.nolaClient.getClient().publish('nola.commands.notify.send', {
        channel: 'email',
        to: this.recipient,
        template: '_inline',
        variables: {
          subject,
          body,
        },
        idempotencyKey: `hq-incident-${dedupKey}`,
        realm: 'nola-hq',
        tenantId: 'nola-studio',
      });
      this.logger.warn(
        `[ALERT ${inc.severity}] ${inc.state} ${inc.serviceId} → ${this.recipient}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to publish notify.send for ${dedupKey}: ${err instanceof Error ? err.message : err}`,
      );
      // Allow retry by clearing the dedup entry.
      this.notifiedIds.delete(dedupKey);
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
    if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)} h`;
    return `${Math.round(ms / 86_400_000)} j`;
  }
}

function renderIncidentBody(inc: HealthIncident): string {
  const openedAt = new Date(inc.openedAt).toLocaleString('fr-FR');
  if (inc.state === 'open') {
    return [
      `Un incident ${inc.severity} vient de s'ouvrir sur la plateforme Nola.`,
      '',
      `Service     : ${inc.serviceName} (${inc.serviceId})`,
      `Sévérité    : ${inc.severity}`,
      `Cause       : ${inc.reason}`,
      `Ouvert à    : ${openedAt}`,
      '',
      'Vérifie l\'état du service dans la console HQ → Health.',
      'Cet incident se fermera automatiquement quand le service repassera online.',
    ].join('\n');
  }
  const closedAt = inc.closedAt ? new Date(inc.closedAt).toLocaleString('fr-FR') : '—';
  const duration = inc.durationMs;
  return [
    `Incident ${inc.severity} résolu sur la plateforme Nola.`,
    '',
    `Service     : ${inc.serviceName} (${inc.serviceId})`,
    `Sévérité    : ${inc.severity}`,
    `Cause       : ${inc.reason}`,
    `Ouvert à    : ${openedAt}`,
    `Fermé à     : ${closedAt}`,
    `Durée totale: ${formatDurationMs(duration)}`,
    '',
    'Le service est revenu en ligne — pas d\'action requise.',
  ].join('\n');
}

function formatDurationMs(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} minutes`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)} heures`;
  return `${Math.round(ms / 86_400_000)} jours`;
}
