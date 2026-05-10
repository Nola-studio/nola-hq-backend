import { ActivityEvent } from './activity/activity.entity';
import { AppEntity } from './apps/app.entity';
import { AppModuleEntity } from './app-modules/app-module.entity';
import { AuditEntry } from './audit/audit.entity';
import { Broadcast } from './broadcast/broadcast.entity';
import { Country } from './countries/country.entity';
import { Deploy } from './deploys/deploy.entity';
import { FeatureMatrixRow } from './plans/feature-matrix-row.entity';
import { HealthEntry } from './health/health-entry.entity';
import { Invoice } from './invoices/invoice.entity';
import { Kpi } from './analytics/kpi.entity';
import { LogEntry } from './logs/log.entity';
import { MomoEntry } from './momo/momo-entry.entity';
import { PipelineItem } from './pipeline/pipeline-item.entity';
import { Plan } from './plans/plan.entity';
import { TeamMember } from './team/team-member.entity';
import { Tenant } from './tenants/tenant.entity';
import { Ticket } from './tickets/ticket.entity';

export const entities = [
  ActivityEvent,
  AppEntity,
  AppModuleEntity,
  AuditEntry,
  Broadcast,
  Country,
  Deploy,
  FeatureMatrixRow,
  HealthEntry,
  Invoice,
  Kpi,
  LogEntry,
  MomoEntry,
  PipelineItem,
  Plan,
  TeamMember,
  Tenant,
  Ticket,
];
