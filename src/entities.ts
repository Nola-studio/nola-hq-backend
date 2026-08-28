import { ActivityEvent } from './activity/activity.entity';
import { AuditEntry } from './audit/audit.entity';
import { Broadcast } from './broadcast/broadcast.entity';
import { BusinessUnit } from './company/business-unit.entity';
import { LegalEntity } from './company/legal-entity.entity';
import { Product } from './company/product.entity';
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
import { PushSubscription } from './push/push-subscription.entity';
import { RoadmapInitiative } from './roadmap/roadmap-initiative.entity';
import { RoadmapKeyResult } from './roadmap/roadmap-key-result.entity';
import { RoadmapMilestone } from './roadmap/roadmap-milestone.entity';
import { RoadmapObjective } from './roadmap/roadmap-objective.entity';
import { RoadmapTrajectoryPoint } from './roadmap/roadmap-trajectory-point.entity';
import { StudioDomain } from './studio/studio-domain.entity';
import { StudioExpense } from './studio/studio-expense.entity';
import { StudioMeeting } from './studio/studio-meeting.entity';
import { StudioNotificationDedup } from './studio/studio-notification-dedup.entity';
import { StudioRecurring } from './studio/studio-recurring.entity';
import { StudioRequest } from './studio/studio-request.entity';
import { TeamMember } from './team/team-member.entity';
import { Tenant } from './tenants/tenant.entity';
import { TenantCrm } from './tenants/tenant-crm.entity';
import { Ticket } from './tickets/ticket.entity';
import { TicketEvent } from './tickets/ticket-event.entity';
import { WorkItem } from './work-items/work-item.entity';
import { WorkItemAttachment } from './work-items/work-item-attachment.entity';
import { WorkItemComment } from './work-items/work-item-comment.entity';
import { WorkItemEvent } from './work-items/work-item-event.entity';
import { WorkItemSubtask } from './work-items/work-item-subtask.entity';
import { WorkSprint } from './work-items/work-sprint.entity';
import { WorkItemDependency } from './work-items/work-item-dependency.entity';
import { ProjectRisk } from './work-items/project-risk.entity';
import { BusinessClient } from './business/business-client.entity';
import { BusinessOpportunity } from './business/business-opportunity.entity';
import { BusinessContract } from './business/business-contract.entity';
import { ProjectBudget } from './business/project-budget.entity';
import { BusinessExpense } from './business/business-expense.entity';
import { BusinessInvoice, BusinessInvoiceLine } from './business/business-invoice.entity';
import { BusinessNumberSequence } from './business/business-number-sequence.entity';
import { BusinessQuote, BusinessQuoteLine } from './business/business-quote.entity';
import { BusinessDocument } from './business/business-document.entity';
import { BusinessReminder } from './business/business-reminder.entity';
import { ProjectTimeEntry } from './business/project-time-entry.entity';

// Le registry des apps n'a PAS de table — c'est une projection in-memory
// reconstruite à partir du JetStream NOLA_REGISTRY (cf. AppsService).
// Aligné sur nola-studio/server.
//
// Every entity used in ANY module's `TypeOrmModule.forFeature([...])` MUST
// also be listed here. `entities.ts` is what actually gets passed to
// `TypeOrmModule.forRootAsync` in app.module.ts (both the Postgres prod
// connection and the SQLite dev one) — that's what registers an entity's
// metadata with the connection. `forFeature()` alone only requests a
// repository provider for an entity the connection is assumed to already
// know about; it registers nothing. Miss this and `@InjectRepository(...)`
// fails at boot with "No metadata found" — this has already happened twice
// (WorkItemAttachment, BusinessInvoiceLine). entities.spec.ts checks this
// automatically; keep it green.
export const entities = [
  ActivityEvent,
  AuditEntry,
  Broadcast,
  BusinessUnit,
  LegalEntity,
  Product,
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
  RoadmapInitiative,
  RoadmapKeyResult,
  RoadmapMilestone,
  RoadmapObjective,
  RoadmapTrajectoryPoint,
  PushSubscription,
  StudioDomain,
  StudioExpense,
  StudioMeeting,
  StudioNotificationDedup,
  StudioRecurring,
  StudioRequest,
  TeamMember,
  Tenant,
  TenantCrm,
  Ticket,
  TicketEvent,
  WorkItem,
  WorkItemAttachment,
  WorkItemComment,
  WorkItemEvent,
  WorkItemSubtask,
  WorkSprint,
  WorkItemDependency,
  ProjectRisk,
  BusinessClient,
  BusinessOpportunity,
  BusinessContract,
  ProjectBudget,
  BusinessExpense,
  BusinessInvoice,
  BusinessInvoiceLine,
  BusinessNumberSequence,
  BusinessQuote,
  BusinessQuoteLine,
  BusinessDocument,
  BusinessReminder,
  ProjectTimeEntry,
];
