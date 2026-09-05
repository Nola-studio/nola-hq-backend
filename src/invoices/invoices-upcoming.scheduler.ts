import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * InvoicesUpcomingScheduler — runs daily to generate and dispatch invoices
 * 3 days before active subscription renewal dates.
 */
@Injectable()
export class InvoicesUpcomingScheduler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(InvoicesUpcomingScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly invoices: InvoicesService) {}

  onApplicationBootstrap(): void {
    // Run interval daily. An initial trigger runs shortly after boot.
    setTimeout(() => void this.runDaily(), 10_000);
    this.timer = setInterval(() => void this.runDaily(), DAY_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async runDaily(): Promise<void> {
    try {
      this.logger.log('Running daily upcoming subscription invoice generation...');
      const created = await this.invoices.generateUpcomingSubscriptionInvoices();
      this.logger.log(
        `Upcoming subscription invoice run completed: ${created.length} invoice(s) generated.`,
      );
    } catch (err) {
      this.logger.error(
        `Upcoming subscription invoice generation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
