import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Kpi } from './kpi.entity';
import { Tenant } from '../tenants/tenant.entity';
import { ActivityEvent } from '../activity/activity.entity';
import { Invoice } from '../invoices/invoice.entity';
import { MomoEntry } from '../momo/momo-entry.entity';
import { Ticket } from '../tickets/ticket.entity';
import { HealthEntry } from '../health/health-entry.entity';
import { AppEntity } from '../apps/app.entity';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Kpi,
      Tenant,
      ActivityEvent,
      Invoice,
      MomoEntry,
      Ticket,
      HealthEntry,
      AppEntity,
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
