import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessUnit } from './business-unit.entity';
import { LegalEntity } from './legal-entity.entity';
import { Product } from './product.entity';
import { BusinessUnitResolverService } from './business-unit-resolver.service';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BusinessUnit, LegalEntity, Product])],
  controllers: [CompanyController],
  providers: [BusinessUnitResolverService, CompanyService],
  exports: [BusinessUnitResolverService],
})
export class CompanyModule {}
