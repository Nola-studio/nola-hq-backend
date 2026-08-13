import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WorkItemsService } from '../work-items/work-items.service';

/**
 * Closes every ticket that has sat in `resolved` past its reopen window
 * (`REOPEN_WINDOW_MS`, `work-items.service.ts`) — same daily-cron shape as
 * `StudioDueSoonScheduler`, but the actual close logic lives on
 * `WorkItemsService.closeExpiredResolved()` so it shares the read-only/
 * audit-trail plumbing with every other mutation path (`record()`).
 */
@Injectable()
export class StudioResolvedCloserScheduler {
  private readonly logger = new Logger(StudioResolvedCloserScheduler.name);

  constructor(private readonly workItems: WorkItemsService) {}

  @Cron('30 8 * * *', { timeZone: 'America/Toronto' })
  async handleCron() {
    await this.run();
  }

  async run() {
    const closed = await this.workItems.closeExpiredResolved();
    if (closed.length > 0) {
      this.logger.log(`auto-closed ${closed.length} resolved ticket(s) past the reopen window`);
    }
  }
}
