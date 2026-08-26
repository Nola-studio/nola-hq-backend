import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoadmapObjective } from './roadmap-objective.entity';
import { RoadmapInitiative } from './roadmap-initiative.entity';
import { RoadmapMilestone } from './roadmap-milestone.entity';
import { RoadmapKeyResult } from './roadmap-key-result.entity';
import { RoadmapTrajectoryPoint } from './roadmap-trajectory-point.entity';
import { MetricSnapshot } from '../analytics/metric-snapshot.entity';
import { WorkItem } from '../work-items/work-item.entity';
import { RoadmapController } from './roadmap.controller';
import { RoadmapService } from './roadmap.service';
import { CompanyModule } from '../company/company.module';

@Module({
  imports: [
    CompanyModule,
    TypeOrmModule.forFeature([
      RoadmapObjective,
      RoadmapInitiative,
      RoadmapMilestone,
      RoadmapKeyResult,
      RoadmapTrajectoryPoint,
      // Read-only: metric-bound key results take their actuals from the
      // daily snapshot series captured by AnalyticsModule.
      MetricSnapshot,
      // Read-only: updateKeyPrefix() checks no WorkItem already references
      // the prefix being changed.
      WorkItem,
    ]),
  ],
  controllers: [RoadmapController],
  providers: [RoadmapService],
  exports: [RoadmapService],
})
export class RoadmapModule {}
