import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedService } from './seed.service';

import { Country } from '../countries/country.entity';
import { AppEntity } from '../apps/app.entity';
import { Plan } from '../plans/plan.entity';
import { FeatureMatrixRow } from '../plans/feature-matrix-row.entity';
import { TeamMember } from '../team/team-member.entity';
import { Tenant } from '../tenants/tenant.entity';
import { ActivityEvent } from '../activity/activity.entity';
import { PipelineItem } from '../pipeline/pipeline-item.entity';
import { HealthEntry } from '../health/health-entry.entity';
import { Ticket } from '../tickets/ticket.entity';
import { Invoice } from '../invoices/invoice.entity';
import { MomoEntry } from '../momo/momo-entry.entity';
import { AppModuleEntity } from '../app-modules/app-module.entity';
import { Deploy } from '../deploys/deploy.entity';
import { AuditEntry } from '../audit/audit.entity';
import { LogEntry } from '../logs/log.entity';
import { Kpi } from '../analytics/kpi.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Country,
      AppEntity,
      Plan,
      FeatureMatrixRow,
      TeamMember,
      Tenant,
      ActivityEvent,
      PipelineItem,
      HealthEntry,
      Ticket,
      Invoice,
      MomoEntry,
      AppModuleEntity,
      Deploy,
      AuditEntry,
      LogEntry,
      Kpi,
    ]),
  ],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
