import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessUnit } from './business-unit.entity';
import { BusinessUnitResolverService } from './business-unit-resolver.service';

@Module({
  imports: [TypeOrmModule.forFeature([BusinessUnit])],
  providers: [BusinessUnitResolverService],
  exports: [BusinessUnitResolverService],
})
export class CompanyModule {}
