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
 *       → nola.events.billing.payment.succeeded  (JetStream, NOLA_HQ_EVENTS)
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

  private static readonly STREAM = 'NOLA_HQ_EVENTS';
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

      await this.eventBus.ensureStream({
        name: PaymentEventsListener.STREAM,
        subjects: PaymentEventsListener.STREAM_SUBJECTS,
        max_age: 30 * 24 * 60 * 60 * 1_000_000_000,
      });
    } catch (err: unknown) {
      this.logger.error(
        `CRITICAL: Payment ingestion stream init failed for ${PaymentEventsListener.STREAM}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }

    for (const { consumer, filter } of PaymentEventsListener.SOURCES) {
      try {
        await this.eventBus.consume<PaymentSucceededEventPayload>(
          PaymentEventsListener.STREAM,
          consumer,
          filter,
          (env) => this.handle(env),
        );
        this.logger.log(
          `Ingesting payment events from ${filter} (stream=${PaymentEventsListener.STREAM}, consumer=${consumer})`,
        );
      } catch (err: unknown) {
        this.logger.error(
          `CRITICAL: Payment consumer bind failed for ${filter} (consumer=${consumer}, stream=${PaymentEventsListener.STREAM}): ${err instanceof Error ? err.message : String(err)}`,
        );
        throw err;
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

