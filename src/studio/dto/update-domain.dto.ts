import { IsBoolean, IsEmail, IsNumberString, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { DATE_PATTERN } from './create-task.dto';

export class UpdateDomainDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) domain?: string;
  @IsOptional() @Matches(DATE_PATTERN) purchaseDate?: string | null;
  @IsOptional() @Matches(DATE_PATTERN) renewalDate?: string | null;
  @IsOptional() @IsString() @MaxLength(120) registrar?: string | null;
  @IsOptional() @IsString() @MaxLength(120) platform?: string | null;
  @IsOptional() @IsString() purpose?: string | null;
  @IsOptional() @IsNumberString() price?: string | null;
  @IsOptional() @IsBoolean() autoRenew?: boolean;
  @IsOptional() @IsString() @MaxLength(120) status?: string | null;
  @IsOptional() @IsUUID() linkedProjectId?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsString() @MaxLength(200) workspace?: string | null;
  @IsOptional() @IsEmail() @MaxLength(160) billingEmail?: string | null;
  @IsOptional() @IsEmail() @MaxLength(120) paidByEmail?: string | null;
  @IsOptional() @IsString() @MaxLength(120) paymentMethod?: string | null;
  @IsOptional() @IsString() @MaxLength(40) billingCycle?: string | null;
}
