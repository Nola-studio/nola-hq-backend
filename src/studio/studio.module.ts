import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoadmapModule } from '../roadmap/roadmap.module';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { WorkItemsModule } from '../work-items/work-items.module';
import { WorkItem } from '../work-items/work-item.entity';
import { StudioMeeting } from './studio-meeting.entity';
import { StudioExpense } from './studio-expense.entity';
import { StudioDomain } from './studio-domain.entity';
import { StudioRecurring } from './studio-recurring.entity';
import { StudioNotificationDedup } from './studio-notification-dedup.entity';
import { TeamMember } from '../team/team-member.entity';
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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoadmapInitiative,
      WorkItem,
      StudioMeeting,
      StudioExpense,
      StudioDomain,
      StudioRecurring,
      StudioNotificationDedup,
      TeamMember,
    ]),
    RoadmapModule,
    WorkItemsModule,
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
