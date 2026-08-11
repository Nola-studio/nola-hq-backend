import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { TeamMember } from '../team/team-member.entity';
import { PushModule } from '../push/push.module';
import { WorkItem } from './work-item.entity';
import { WorkItemAttachment } from './work-item-attachment.entity';
import { WorkItemComment } from './work-item-comment.entity';
import { WorkItemEvent } from './work-item-event.entity';
import { WorkItemSubtask } from './work-item-subtask.entity';
import { WorkSprint } from './work-sprint.entity';
import { WorkItemDependency } from './work-item-dependency.entity';
import { ProjectRisk } from './project-risk.entity';
import { WorkPlanningService } from './work-planning.service';
import { WorkPlanningController } from './work-planning.controller';
import { WorkItemsController } from './work-items.controller';
import { WorkItemsService } from './work-items.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkItem,
      WorkItemAttachment,
      WorkItemComment,
      WorkItemEvent,
      WorkItemSubtask,
      RoadmapInitiative,
      TeamMember,
      WorkSprint,
      WorkItemDependency,
      ProjectRisk,
    ]),
    PushModule,
  ],
  controllers: [WorkItemsController, WorkPlanningController],
  providers: [WorkItemsService, WorkPlanningService],
  exports: [WorkItemsService, WorkPlanningService],
})
export class WorkItemsModule {}
