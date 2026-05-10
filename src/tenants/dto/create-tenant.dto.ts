import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

const STATUSES = [
  'healthy',
  'attention',
  'trial',
  'onboarding',
  'churn-risk',
  'suspended',
] as const;

export class CreateTenantDto {
  @IsOptional() @IsString() id?: string;
  @IsString() name!: string;
  @IsString() @Length(2, 2) country!: string;
  @IsString() city!: string;
  @IsArray() @IsString({ each: true }) apps!: string[];
  @IsString() plan!: string;
  @IsOptional() @IsInt() @Min(0) mrr_cdf?: number;
  @IsIn(STATUSES as unknown as string[])
  status!: (typeof STATUSES)[number];
  @IsString() since!: string;
  @IsOptional() @IsInt() @Min(0) users?: number;
  @IsString() owner!: string;
  @IsString() whatsapp!: string;
  @IsString() mobile_money!: string;
  @IsOptional() @IsInt() @Min(0) ar_days?: number;
  @IsOptional() @IsInt() nps?: number | null;
}
