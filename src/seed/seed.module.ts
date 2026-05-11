import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedService } from './seed.service';

import { Country } from '../countries/country.entity';
import { AppEntity } from '../apps/app.entity';
import { Plan } from '../plans/plan.entity';
import { FeatureMatrixRow } from '../plans/feature-matrix-row.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Country, AppEntity, Plan, FeatureMatrixRow]),
  ],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
