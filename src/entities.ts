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
import { StudioProject } from './studio/studio-project.entity';
import { StudioRecurring } from './studio/studio-recurring.entity';
import { StudioTask } from './studio/studio-task.entity';
import { TeamMember } from './team/team-member.entity';
import { Tenant } from './tenants/tenant.entity';
import { TenantCrm } from './tenants/tenant-crm.entity';
import { Ticket } from './tickets/ticket.entity';
import { WorkItem } from './work-items/work-item.entity';
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
import { BusinessInvoice } from './business/business-invoice.entity';
import { BusinessQuote, BusinessQuoteLine } from './business/business-quote.entity';
import { BusinessDocument } from './business/business-document.entity';
import { BusinessReminder } from './business/business-reminder.entity';
import { ProjectTimeEntry } from './business/project-time-entry.entity';

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
  StudioProject,
  StudioRecurring,
  StudioTask,
  TeamMember,
  Tenant,
  TenantCrm,
  Ticket,
  WorkItem,
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
  BusinessQuote,
  BusinessQuoteLine,
  BusinessDocument,
  BusinessReminder,
  ProjectTimeEntry,
];
