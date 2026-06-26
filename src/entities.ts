import { ActivityEvent } from './activity/activity.entity';
import { AuditEntry } from './audit/audit.entity';
import { Broadcast } from './broadcast/broadcast.entity';
import { Country } from './countries/country.entity';
import { Deploy } from './deploys/deploy.entity';
import { HealthEntry } from './health/health-entry.entity';
import { Invoice } from './invoices/invoice.entity';
import { Kpi } from './analytics/kpi.entity';
import { MetricSnapshot } from './analytics/metric-snapshot.entity';
import { LogEntry } from './logs/log.entity';
import { ModuleOverride } from './modules/module-override.entity';
import { MomoEntry } from './momo/momo-entry.entity';
import { PipelineItem } from './pipeline/pipeline-item.entity';
import { TeamMember } from './team/team-member.entity';
import { Tenant } from './tenants/tenant.entity';
import { TenantCrm } from './tenants/tenant-crm.entity';
import { Ticket } from './tickets/ticket.entity';

// Le registry des apps n'a PAS de table — c'est une projection in-memory
// reconstruite à partir du JetStream NOLA_REGISTRY (cf. AppsService).
// Aligné sur nola-studio/server.
export const entities = [
  ActivityEvent,
  AuditEntry,
  Broadcast,
  Country,
  Deploy,
  HealthEntry,
  Invoice,
  Kpi,
  MetricSnapshot,
  LogEntry,
  ModuleOverride,
  MomoEntry,
  PipelineItem,
  TeamMember,
  Tenant,
  TenantCrm,
  Ticket,
];
