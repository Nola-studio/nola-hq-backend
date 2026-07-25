import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoadmapObjective } from './roadmap-objective.entity';
import { RoadmapInitiative } from './roadmap-initiative.entity';
import { RoadmapMilestone } from './roadmap-milestone.entity';
import { RoadmapKeyResult } from './roadmap-key-result.entity';
import { RoadmapTrajectoryPoint } from './roadmap-trajectory-point.entity';
import { MetricSnapshot } from '../analytics/metric-snapshot.entity';
import { RoadmapController } from './roadmap.controller';
import { RoadmapService } from './roadmap.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoadmapObjective,
      RoadmapInitiative,
      RoadmapMilestone,
      RoadmapKeyResult,
      RoadmapTrajectoryPoint,
      // Read-only: metric-bound key results take their actuals from the
      // daily snapshot series captured by AnalyticsModule.
      MetricSnapshot,
    ]),
  ],
  controllers: [RoadmapController],
  providers: [RoadmapService],
  exports: [RoadmapService],
})
export class RoadmapModule {}
