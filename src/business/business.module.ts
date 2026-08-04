import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { BusinessClient } from './business-client.entity';
import { BusinessContract } from './business-contract.entity';
import { BusinessController } from './business.controller';
import { BusinessExpense } from './business-expense.entity';
import { BusinessInvoice } from './business-invoice.entity';
import { BusinessOpportunity } from './business-opportunity.entity';
import { BusinessService } from './business.service';
import { ProjectBudget } from './project-budget.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BusinessClient,
      BusinessOpportunity,
      BusinessContract,
      ProjectBudget,
      BusinessExpense,
      BusinessInvoice,
      RoadmapInitiative,
    ]),
  ],
  controllers: [BusinessController],
  providers: [BusinessService],
  exports: [BusinessService],
})
export class BusinessModule {}
