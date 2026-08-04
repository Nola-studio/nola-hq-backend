import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudioProject } from './studio-project.entity';
import { StudioTask } from './studio-task.entity';
import { StudioMeeting } from './studio-meeting.entity';
import { StudioExpense } from './studio-expense.entity';
import { StudioService } from './studio.service';
import { StudioTasksService } from './studio-tasks.service';
import { StudioTasksController } from './studio-tasks.controller';
import { StudioExpensesService } from './studio-expenses.service';
import { StudioExpensesController } from './studio-expenses.controller';
import { StudioDashboardService } from './studio-dashboard.service';
import { StudioDashboardController } from './studio-dashboard.controller';
import { StudioMeetingsService } from './studio-meetings.service';
import { StudioMeetingsController } from './studio-meetings.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StudioProject,
      StudioTask,
      StudioMeeting,
      StudioExpense,
    ]),
  ],
  controllers: [
    StudioTasksController,
    StudioExpensesController,
    StudioDashboardController,
    StudioMeetingsController,
  ],
  providers: [
    StudioService,
    StudioTasksService,
    StudioExpensesService,
    StudioDashboardService,
    StudioMeetingsService,
  ],
  exports: [
    StudioService,
    StudioTasksService,
    StudioExpensesService,
    StudioDashboardService,
    StudioMeetingsService,
  ],
})
export class StudioModule {}
