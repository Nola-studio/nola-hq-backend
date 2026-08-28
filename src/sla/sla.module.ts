import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SlaPolicy } from './sla-policy.entity';
import { SlaPolicyService } from './sla-policy.service';
import { SlaPolicyController } from './sla-policy.controller';
import { CompanyModule } from '../company/company.module';

@Module({
  imports: [TypeOrmModule.forFeature([SlaPolicy]), CompanyModule],
  controllers: [SlaPolicyController],
  providers: [SlaPolicyService],
  exports: [SlaPolicyService],
})
export class SlaModule {}
