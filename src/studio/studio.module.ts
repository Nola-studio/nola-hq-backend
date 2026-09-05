import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyModule } from '../company/company.module';
import { RoadmapModule } from '../roadmap/roadmap.module';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { RoadmapMilestone } from '../roadmap/roadmap-milestone.entity';
import { WorkItemsModule } from '../work-items/work-items.module';
import { WorkItem } from '../work-items/work-item.entity';
import { ReleasesModule } from '../releases/releases.module';
// Le domaine fonctionnel (§4A) — à ne pas confondre avec `StudioDomain`,
// qui est un nom de domaine internet.
import { Domain } from '../domains/domain.entity';
import { ProjectRisk } from '../work-items/project-risk.entity';
import { WorkSprint } from '../work-items/work-sprint.entity';
import { ProjectBudget } from '../business/project-budget.entity';
import { ProjectTimeEntry } from '../business/project-time-entry.entity';
import { BusinessExpense } from '../business/business-expense.entity';
import { BusinessInvoice } from '../business/business-invoice.entity';
import { BusinessOpportunity } from '../business/business-opportunity.entity';
import { BusinessContract } from '../business/business-contract.entity';
import { BusinessQuote } from '../business/business-quote.entity';
import { StudioMeeting } from './studio-meeting.entity';
import { StudioExpense } from './studio-expense.entity';
import { StudioDomain } from './studio-domain.entity';
import { StudioRecurring } from './studio-recurring.entity';
import { StudioNotificationDedup } from './studio-notification-dedup.entity';
import { TeamMember } from '../team/team-member.entity';
import { PushModule } from '../push/push.module';
import { StudioProjectsProxyService } from './studio-projects-proxy.service';
import { StudioProjectsProxyController } from './studio-projects-proxy.controller';
import { StudioExpensesService } from './studio-expenses.service';
import { StudioExpensesController } from './studio-expenses.controller';
import { StudioDomainsService } from './studio-domains.service';
import { StudioDomainsController } from './studio-domains.controller';
import { StudioRecurringService } from './studio-recurring.service';
import { StudioRecurringController } from './studio-recurring.controller';
import { StudioDashboardService } from './studio-dashboard.service';
import { StudioDashboardController } from './studio-dashboard.controller';
import { StudioMeetingsService } from './studio-meetings.service';
import { StudioMeetingsController } from './studio-meetings.controller';
import { StudioNotifyService } from './studio-notify.service';
import { StudioDueSoonScheduler } from './studio-due-soon.scheduler';
import { StudioResolvedCloserScheduler } from './studio-resolved-closer.scheduler';

@Module({
  imports: [
    // Le rattachement d'un ticket à une version passe par ce service : la
    // cascade vers les sous-tâches n'a pas à être réécrite ici.
    ReleasesModule,
    TypeOrmModule.forFeature([
      Domain,
      RoadmapInitiative,
      RoadmapMilestone,
      WorkItem,
      ProjectRisk,
      WorkSprint,
      ProjectBudget,
      ProjectTimeEntry,
      BusinessExpense,
      BusinessInvoice,
      BusinessOpportunity,
      BusinessContract,
      BusinessQuote,
      StudioMeeting,
      StudioExpense,
      StudioDomain,
      StudioRecurring,
      StudioNotificationDedup,
      TeamMember,
    ]),
    RoadmapModule,
    WorkItemsModule,
    CompanyModule,
    PushModule,
  ],
  controllers: [
    StudioProjectsProxyController,
    StudioExpensesController,
    StudioDomainsController,
    StudioRecurringController,
    StudioDashboardController,
    StudioMeetingsController,
  ],
  providers: [
    StudioProjectsProxyService,
    StudioExpensesService,
    StudioDomainsService,
    StudioRecurringService,
    StudioDashboardService,
    StudioMeetingsService,
    StudioNotifyService,
    StudioDueSoonScheduler,
    StudioResolvedCloserScheduler,
  ],
  exports: [
    StudioProjectsProxyService,
    StudioExpensesService,
    StudioDomainsService,
    StudioRecurringService,
    StudioDashboardService,
    StudioMeetingsService,
  ],
})
export class StudioModule {}
