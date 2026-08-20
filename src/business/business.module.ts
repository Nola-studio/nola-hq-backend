import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { BusinessClient } from './business-client.entity';
import { BusinessContract } from './business-contract.entity';
import { BusinessController } from './business.controller';
import { BusinessExpense } from './business-expense.entity';
import { BusinessInvoice, BusinessInvoiceLine } from './business-invoice.entity';
import { BusinessNumberSequence } from './business-number-sequence.entity';
import { BusinessOpportunity } from './business-opportunity.entity';
import { BusinessService } from './business.service';
import { ProjectBudget } from './project-budget.entity';
import { WorkItem } from '../work-items/work-item.entity';
import { BusinessDocument } from './business-document.entity';
import { BusinessOperationsController } from './business-operations.controller';
import { BusinessOperationsService } from './business-operations.service';
import { BusinessPdfService } from './business-pdf.service';
import { BusinessQuote, BusinessQuoteLine } from './business-quote.entity';
import { BusinessReminder } from './business-reminder.entity';
import { ProjectTimeEntry } from './project-time-entry.entity';
import { ProjectRisk } from '../work-items/project-risk.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BusinessClient,
      BusinessOpportunity,
      BusinessContract,
      ProjectBudget,
      BusinessExpense,
      BusinessInvoice,
      BusinessInvoiceLine,
      BusinessNumberSequence,
      RoadmapInitiative,
      WorkItem,
      BusinessQuote,
      BusinessQuoteLine,
      BusinessDocument,
      BusinessReminder,
      ProjectTimeEntry,
      ProjectRisk,
    ]),
  ],
  controllers: [BusinessController, BusinessOperationsController],
  providers: [BusinessService, BusinessOperationsService, BusinessPdfService],
  exports: [BusinessService, BusinessOperationsService],
})
export class BusinessModule {}
