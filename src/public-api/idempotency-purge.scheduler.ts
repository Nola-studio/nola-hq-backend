import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IdempotencyService } from './idempotency.service';

/** Les clés expirées ne servent plus qu'à faire grossir la table. */
@Injectable()
export class IdempotencyPurgeScheduler {
  private readonly logger = new Logger(IdempotencyPurgeScheduler.name);

  constructor(private readonly idempotency: IdempotencyService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purge(): Promise<void> {
    const removed = await this.idempotency.purgeExpired();
    if (removed > 0) this.logger.log(`Clés d'idempotence expirées purgées : ${removed}`);
  }
}
