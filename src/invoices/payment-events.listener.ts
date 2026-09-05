import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBus, type EventEnvelope } from '@nola-studio/sdk';
import { NolaClientService } from '@nola-hq/nola-sdk';
import { InvoicesService } from './invoices.service';
import type { PaymentSucceededEventPayload } from './dto/payment-succeeded.dto';

/**
 * Ingests `payment.succeeded` events from the Nola ecosystem over JetStream.
 *
 * Flow:
 *   nola-billing (or payment gateway)
 *     → NolaEventsService.emit('billing.payment.succeeded', payload)
 *       → nola.events.billing.payment.succeeded  (JetStream, cf. NOLA_HQ_EVENTS_STREAM)
 *         → THIS listener → InvoicesService.processPaymentSucceeded(...)
 *
 * NOTE ON NATS PERMISSIONS:
 * Consumed over JetStream (EventBus.consume) — NOT raw core-NATS subscribe.
 * The `nola` user has no core `sub` permission on the `nola.events.*` space
 * (only the JetStream consumer API is granted), so a raw subscription would
 * trigger a fatal PERMISSIONS_VIOLATION. This matches SupportIngestListener,
 * IncidentAlertListener, and LogsIngestListener.
 *
 * NOTE ON DURABLE CONSUMER LIFECYCLE:
 * Unlike LogsIngestListener and IncidentAlertListener (which delete and recreate
 * their consumers at boot to discard historical log/alert noise), this listener
 * INTENTIONALLY uses a persistent durable consumer that is NEVER deleted at boot.
 * A payment event that arrives while HQ is restarting or redeploying MUST NOT be dropped —
 * invoices and receipts are legally and financially critical, requiring at-least-once
 * processing with redelivery on unhandled errors.
 *
 * Disable with NOLA_HQ_PAYMENT_INGEST=false.
 */
@Injectable()
export class PaymentEventsListener implements OnApplicationBootstrap {
  private readonly logger = new Logger(PaymentEventsListener.name);
  private eventBus: EventBus | null = null;
  private readonly enabled: boolean;

  /**
   * Le flux JetStream d'où viennent les paiements.
   *
   * Configurable pour la même raison que dans `SupportIngestListener` : sur un
   * compte NATS où un flux de plateforme couvre déjà `nola.events.>`, en créer
   * un second est refusé — « subjects overlap with an existing stream ». Là,
   * HQ doit consommer celui qui existe (`NOLA_HQ_EVENTS_STREAM=NOLA_EVENTS`)
   * plutôt que réclamer le sien. Une seule variable règle les quatre
   * écouteurs.
   */
  private readonly stream: string;
  private static readonly DEFAULT_STREAM = 'NOLA_HQ_EVENTS';
  private static readonly STREAM_SUBJECTS = ['nola.events.>'];

  static readonly SOURCES: ReadonlyArray<{
    consumer: string;
    filter: string;
  }> = [
    {
      consumer: 'nola-hq-payment-succeeded',
      filter: 'nola.events.billing.payment.succeeded',
    },
    {
      consumer: 'nola-hq-payment-succeeded-generic',
      filter: 'nola.events.payment.succeeded',
    },
  ];

  constructor(
    private readonly nolaClient: NolaClientService,
    private readonly invoices: InvoicesService,
    private readonly config: ConfigService,
  ) {
    this.enabled =
      (this.config.get<string>('NOLA_HQ_PAYMENT_INGEST') ?? 'true') !== 'false';
    this.stream =
      this.config.get<string>('NOLA_HQ_EVENTS_STREAM') ??
      PaymentEventsListener.DEFAULT_STREAM;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('Payment event ingestion disabled (NOLA_HQ_PAYMENT_INGEST=false)');
      return;
    }
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    for (let i = 0; i < 30 && !this.nolaClient.isReady(); i += 1) {
      await new Promise((r) => setTimeout(r, 4_000));
    }
    if (!this.nolaClient.isReady()) {
      this.logger.warn(
        'NolaClient not ready after 30 attempts — payment ingestion disabled',
      );
      return;
    }

    try {
      this.eventBus = new EventBus(this.nolaClient.getClient());
      await this.eventBus.init();
    } catch (err: unknown) {
      this.logger.error(
        `CRITICAL: Payment ingestion bus init failed: ${err instanceof Error ? err.message : String(err)}`,
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
     * processus. Nolaa HQ tout entier tombait parce qu'une ingestion de
     * paiements ne pouvait pas déclarer son flux.
     */
    try {
      await this.eventBus.ensureStream({
        name: this.stream,
        subjects: PaymentEventsListener.STREAM_SUBJECTS,
        max_age: 30 * 24 * 60 * 60 * 1_000_000_000,
      });
    } catch (err: unknown) {
      this.logger.warn(
        `Payment ingestion could not declare stream ${this.stream} ` +
          `(${err instanceof Error ? err.message : String(err)}) — ` +
          "si un flux de plateforme couvre déjà « nola.events.> », pointez HQ dessus " +
          'avec NOLA_HQ_EVENTS_STREAM. Tentative de consommation malgré tout.',
      );
    }

    for (const { consumer, filter } of PaymentEventsListener.SOURCES) {
      try {
        await this.eventBus.consume<PaymentSucceededEventPayload>(
          this.stream,
          consumer,
          filter,
          (env) => this.handle(env),
        );
        this.logger.log(
          `Ingesting payment events from ${filter} (stream=${this.stream}, consumer=${consumer})`,
        );
      } catch (err: unknown) {
        // Une source qui ne se lie pas ne doit emporter ni l'autre ni
        // l'application : le durable n'est jamais supprimé au boot, donc le
        // paiement reste dans le flux et le prochain démarrage le reprendra.
        this.logger.error(
          `CRITICAL: Payment consumer bind failed for ${filter} (consumer=${consumer}, stream=${this.stream}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async handle(
    env: EventEnvelope<PaymentSucceededEventPayload>,
  ): Promise<void> {
    const payload = env.payload;
    if (!payload || !payload.tenantId || payload.amount === undefined) {
      this.logger.warn(
        `Dropping malformed payment.succeeded event: missing required fields (tenantId=${payload?.tenantId})`,
      );
      return;
    }

    try {
      const result = await this.invoices.processPaymentSucceeded(payload);
      this.logger.log(
        `Payment processed successfully — invoice=${result.invoiceNumber} receipt=${result.receiptNumber} brand=${result.brandName} tenant=${payload.tenantId}`,
      );
    } catch (err: any) {
      this.logger.error(
        `Failed to process payment.succeeded event (tenant=${payload.tenantId} app=${payload.appId || payload.productCode}): ${err.message}`,
      );
      // Re-throw so JetStream can redeliver if transient, or fail-closed
      throw err;
    }
  }
}

