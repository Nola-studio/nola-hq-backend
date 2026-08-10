import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BUSINESS_DOCUMENT_ENTITY_TYPES, type BusinessDocumentEntityType } from '../business-document.entity';
import { BUSINESS_QUOTE_STATUSES, type BusinessQuoteStatus } from '../business-quote.entity';
import {
  BUSINESS_REMINDER_ENTITY_TYPES,
  BUSINESS_REMINDER_STATUSES,
  type BusinessReminderEntityType,
  type BusinessReminderStatus,
} from '../business-reminder.entity';
import { BUSINESS_CURRENCIES, type BusinessCurrency } from '../business-currency';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MONEY = 9_000_000_000_000_000;

export class BusinessQuoteLineDto {
  @IsString() @MinLength(2) @MaxLength(240) description!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1_000_000) quantity!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(MAX_MONEY) unitPriceCdf!: number;
}

export class CreateBusinessQuoteDto {
  @IsOptional() @IsString() @MaxLength(64) number?: string;
  @IsUUID() clientId!: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() opportunityId?: string;
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsOptional() @IsIn(BUSINESS_QUOTE_STATUSES as unknown as string[]) status?: BusinessQuoteStatus;
  @Matches(DATE_PATTERN) issuedOn!: string;
  @Matches(DATE_PATTERN) validUntil!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) taxRate?: number;
  @IsOptional() @IsIn(BUSINESS_CURRENCIES as unknown as string[]) currency?: BusinessCurrency;
  @IsOptional() @IsString() @MaxLength(5_000) paymentTerms?: string;
  @IsOptional() @IsString() @MaxLength(5_000) notes?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => BusinessQuoteLineDto)
  lines!: BusinessQuoteLineDto[];
}

export class UpdateBusinessQuoteDto extends PartialType(CreateBusinessQuoteDto) {}

export class ConvertQuoteToInvoiceDto {
  @Matches(DATE_PATTERN) dueOn!: string;
  @IsOptional() @IsIn(['draft', 'sent']) status?: 'draft' | 'sent';
}

export class CreateBusinessDocumentDto {
  @IsIn(BUSINESS_DOCUMENT_ENTITY_TYPES as unknown as string[]) entityType!: BusinessDocumentEntityType;
  @IsUUID() entityId!: string;
  @IsString() @MinLength(2) @MaxLength(200) name!: string;
  @IsUrl({ require_protocol: true, protocols: ['https', 'http'] }) @MaxLength(500) url!: string;
  @IsOptional() @IsString() @MaxLength(120) mimeType?: string;
  @IsOptional() @IsString() @MaxLength(80) kind?: string;
}

export class CreateBusinessReminderDto {
  @IsIn(BUSINESS_REMINDER_ENTITY_TYPES as unknown as string[]) entityType!: BusinessReminderEntityType;
  @IsUUID() entityId!: string;
  @IsString() @MinLength(2) @MaxLength(220) title!: string;
  @IsISO8601() dueAt!: string;
  @IsOptional() @IsString() @MaxLength(160) assignee?: string;
  @IsOptional() @IsString() @MaxLength(5_000) note?: string;
}

export class UpdateBusinessReminderDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(220) title?: string;
  @IsOptional() @IsISO8601() dueAt?: string;
  @IsOptional() @IsString() @MaxLength(160) assignee?: string;
  @IsOptional() @IsString() @MaxLength(5_000) note?: string;
  @IsOptional() @IsIn(BUSINESS_REMINDER_STATUSES as unknown as string[]) status?: BusinessReminderStatus;
}

export class CreateProjectTimeEntryDto {
  @IsUUID() projectId!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) workItemId?: number;
  @IsString() @MinLength(2) @MaxLength(160) member!: string;
  @Matches(DATE_PATTERN) workDate!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(1_440) minutes!: number;
  @IsOptional() @IsBoolean() billable?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(MAX_MONEY) hourlyRateCdf?: number;
  @IsOptional() @IsIn(BUSINESS_CURRENCIES as unknown as string[]) hourlyRateCurrency?: BusinessCurrency;
  @IsOptional() @IsString() @MaxLength(5_000) description?: string;
}

export class UpdateProjectTimeEntryDto extends PartialType(CreateProjectTimeEntryDto) {}

export class CashflowQueryDto {
  @IsOptional() @Matches(DATE_PATTERN) from?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(24) months?: number;
  @IsOptional() @IsUUID() projectId?: string;
}
