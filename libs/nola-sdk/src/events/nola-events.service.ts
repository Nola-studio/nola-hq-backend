import { Injectable, Logger } from '@nestjs/common';
import { EventBus, type EventEnvelope } from '@nola-studio/sdk';
import { NolaClientService } from '../nola-client.service';

/**
 * Wraps `@nola-studio/sdk` EventBus (JetStream-backed).
 *
 * Sujets : `nola.events.<domain>.<type>` pour l'outbound,
 * `nola.events.payment.*` etc. pour les événements consommés (chap. 4.5).
 */
@Injectable()
export class NolaEventsService {
  private readonly logger = new Logger(NolaEventsService.name);
  private bus: EventBus | null = null;

  constructor(private readonly nolaClient: NolaClientService) {}

  async emit<T>(domainType: string, payload: T, correlationId?: string): Promise<void> {
    if (!this.nolaClient.isReady()) {
      this.logger.warn(
        `emit("${domainType}") skipped — NolaClient offline. Payload dropped.`,
      );
      return;
    }
    await this.ensureBus();
    const subject = `nola.events.${domainType}`;
    await this.bus!.emit(subject, payload, 'kelasi', correlationId);
    this.logger.debug(`Emitted ${subject}`);
  }

  async consume<T>(
    stream: string,
    consumerName: string,
    domainType: string,
    handler: (envelope: EventEnvelope<T>) => Promise<void>,
  ): Promise<void> {
    if (!this.nolaClient.isReady()) {
      this.logger.warn(
        `consume("${domainType}") skipped — NolaClient offline.`,
      );
      return;
    }
    await this.ensureBus();
    const filterSubject = `nola.events.${domainType}`;
    await this.bus!.consume(stream, consumerName, filterSubject, handler);
    this.logger.log(`Consuming ${filterSubject} via ${consumerName}@${stream}`);
  }

  private async ensureBus(): Promise<void> {
    if (!this.bus) {
      this.bus = new EventBus(this.nolaClient.getClient());
      await this.bus.init();
    }
  }
}
