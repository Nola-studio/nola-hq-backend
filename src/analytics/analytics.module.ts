import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Kpi } from './kpi.entity';
import { Tenant } from '../tenants/tenant.entity';
import { ActivityEvent } from '../activity/activity.entity';
import { Invoice } from '../invoices/invoice.entity';
import { MomoEntry } from '../momo/momo-entry.entity';
import { Ticket } from '../tickets/ticket.entity';
import { HealthEntry } from '../health/health-entry.entity';
import { AppsModule } from '../apps/apps.module';
import { TenantsModule } from '../tenants/tenants.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { HealthModule } from '../health/health.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [
    // Local TypeORM features kept for KPI table + legacy tickets/momo
    // entries that still live in the HQ Postgres.
    TypeOrmModule.forFeature([
      Kpi,
      Tenant,
      ActivityEvent,
      Invoice,
      MomoEntry,
      Ticket,
      HealthEntry,
    ]),
    // Canonical data sources — Tenants now come from nola-billing via
    // NATS (TenantsService.list), Invoices likewise. AppsService is the
    // in-memory registry projection. HealthService aggregates the JetStream
    // metrics streams.
    AppsModule,
    TenantsModule,
    InvoicesModule,
    HealthModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
