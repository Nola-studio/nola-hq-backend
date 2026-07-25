import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoadmapObjective } from './roadmap-objective.entity';
import { RoadmapInitiative } from './roadmap-initiative.entity';
import { RoadmapMilestone } from './roadmap-milestone.entity';
import { RoadmapController } from './roadmap.controller';
import { RoadmapService } from './roadmap.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoadmapObjective,
      RoadmapInitiative,
      RoadmapMilestone,
    ]),
  ],
  controllers: [RoadmapController],
  providers: [RoadmapService],
  exports: [RoadmapService],
})
export class RoadmapModule {}
