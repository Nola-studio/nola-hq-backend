import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BUSINESS_CLIENT_STATUSES, type BusinessClientStatus } from '../business-client.entity';
import { BUSINESS_CONTRACT_STATUSES, type BusinessContractStatus } from '../business-contract.entity';
import { BUSINESS_EXPENSE_STATUSES, type BusinessExpenseStatus } from '../business-expense.entity';
import { BUSINESS_INVOICE_STATUSES, type BusinessInvoiceStatus } from '../business-invoice.entity';
import { BUSINESS_OPPORTUNITY_STAGES, type BusinessOpportunityStage } from '../business-opportunity.entity';
import { INITIATIVE_SCOPES } from '../../roadmap/dto/create-initiative.dto';
import type { RoadmapInitiativeScope } from '../../roadmap/roadmap-initiative.entity';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const MAX_MONEY = 9_000_000_000_000_000;

export class CreateBusinessClientDto {
  @IsString() @MinLength(2) @MaxLength(180) name!: string;
  @IsOptional() @IsIn(BUSINESS_CLIENT_STATUSES as unknown as string[]) status?: BusinessClientStatus;
  @IsOptional() @IsString() @MaxLength(160) contactName?: string;
  @IsOptional() @IsEmail() @MaxLength(180) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @Matches(COUNTRY_PATTERN) country?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(160) owner?: string;
  @IsOptional() @IsString() @MaxLength(5_000) notes?: string;
}

export class UpdateBusinessClientDto extends PartialType(CreateBusinessClientDto) {}

export class CreateBusinessOpportunityDto {
  @IsUUID() clientId!: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsOptional() @IsIn(BUSINESS_OPPORTUNITY_STAGES as unknown as string[]) stage?: BusinessOpportunityStage;
  @Type(() => Number) @IsInt() @Min(0) @Max(MAX_MONEY) valueCdf!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) probability?: number;
  @IsOptional() @Matches(DATE_PATTERN) expectedCloseDate?: string;
  @IsOptional() @IsString() @MaxLength(2_000) nextStep?: string;
  @IsOptional() @IsString() @MaxLength(2_000) lossReason?: string;
  @IsOptional() @IsString() @MaxLength(160) owner?: string;
}

export class UpdateBusinessOpportunityDto extends PartialType(CreateBusinessOpportunityDto) {}

export class CreateBusinessContractDto {
  @IsOptional() @IsString() @MaxLength(64) number?: string;
  @IsUUID() clientId!: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() opportunityId?: string;
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsOptional() @IsIn(BUSINESS_CONTRACT_STATUSES as unknown as string[]) status?: BusinessContractStatus;
  @Type(() => Number) @IsInt() @Min(0) @Max(MAX_MONEY) valueCdf!: number;
  @IsOptional() @Matches(DATE_PATTERN) startDate?: string;
  @IsOptional() @Matches(DATE_PATTERN) endDate?: string;
  @IsOptional() @IsString() @MaxLength(200) paymentTerms?: string;
  @IsOptional() @IsString() @MaxLength(5_000) notes?: string;
}

export class UpdateBusinessContractDto extends PartialType(CreateBusinessContractDto) {}

export class UpsertProjectBudgetDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(MAX_MONEY) revenueBudgetCdf!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(MAX_MONEY) expenseBudgetCdf!: number;
}

export class CreateBusinessExpenseDto {
  @IsUUID() projectId!: string;
  @IsOptional() @IsUUID() contractId?: string;
  @IsString() @MinLength(2) @MaxLength(160) label!: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(MAX_MONEY) amountCdf!: number;
  @Matches(DATE_PATTERN) incurredOn!: string;
  @IsOptional() @IsString() @MaxLength(160) vendor?: string;
  @IsOptional() @IsIn(BUSINESS_EXPENSE_STATUSES as unknown as string[]) status?: BusinessExpenseStatus;
  @IsOptional() @IsString() @MaxLength(5_000) notes?: string;
}

export class UpdateBusinessExpenseDto extends PartialType(CreateBusinessExpenseDto) {}

export class CreateBusinessInvoiceDto {
  @IsOptional() @IsString() @MaxLength(64) number?: string;
  @IsUUID() clientId!: string;
  @IsUUID() projectId!: string;
  @IsOptional() @IsUUID() contractId?: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(MAX_MONEY) amountCdf!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(MAX_MONEY) paidAmountCdf?: number;
  @Matches(DATE_PATTERN) issuedOn!: string;
  @Matches(DATE_PATTERN) dueOn!: string;
  @IsOptional() @IsIn(BUSINESS_INVOICE_STATUSES as unknown as string[]) status?: BusinessInvoiceStatus;
  @IsOptional() @IsString() @MaxLength(5_000) description?: string;
}

export class UpdateBusinessInvoiceDto extends PartialType(CreateBusinessInvoiceDto) {}

/**
 * GET /business/project-portfolio — omit `scope` to get every project row
 * (pre-existing behavior); pass it to stop blending durable products and
 * bounded initiatives in one table.
 */
export class ListProjectPortfolioDto {
  @IsOptional() @IsIn(INITIATIVE_SCOPES as unknown as string[]) scope?: RoadmapInitiativeScope;
}
