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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StudioProject,
      StudioTask,
      StudioMeeting,
      StudioExpense,
    ]),
  ],
  controllers: [StudioTasksController, StudioExpensesController],
  providers: [StudioService, StudioTasksService, StudioExpensesService],
  exports: [StudioService, StudioTasksService, StudioExpensesService],
})
export class StudioModule {}
