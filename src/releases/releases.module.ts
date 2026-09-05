import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Release } from './release.entity';
import { WorkItem } from '../work-items/work-item.entity';
import { ReleasesService } from './releases.service';
import { ReleasesController } from './releases.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Release, WorkItem])],
  controllers: [ReleasesController],
  providers: [ReleasesService],
  exports: [ReleasesService],
})
export class ReleasesModule {}
