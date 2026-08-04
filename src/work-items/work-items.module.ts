import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { TeamMember } from '../team/team-member.entity';
import { PushModule } from '../push/push.module';
import { WorkItem } from './work-item.entity';
import { WorkItemComment } from './work-item-comment.entity';
import { WorkItemEvent } from './work-item-event.entity';
import { WorkItemSubtask } from './work-item-subtask.entity';
import { WorkItemsController } from './work-items.controller';
import { WorkItemsService } from './work-items.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkItem,
      WorkItemComment,
      WorkItemEvent,
      WorkItemSubtask,
      RoadmapInitiative,
      TeamMember,
    ]),
    PushModule,
  ],
  controllers: [WorkItemsController],
  providers: [WorkItemsService],
  exports: [WorkItemsService],
})
export class WorkItemsModule {}
