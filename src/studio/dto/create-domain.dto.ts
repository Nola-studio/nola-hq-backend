import { IsBoolean, IsEmail, IsNumberString, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { DATE_PATTERN } from './create-task.dto';

export class CreateDomainDto {
  @IsString() @MinLength(1) @MaxLength(255) domain!: string;
  @IsOptional() @Matches(DATE_PATTERN) purchaseDate?: string;
  @IsOptional() @Matches(DATE_PATTERN) renewalDate?: string;
  @IsOptional() @IsString() @MaxLength(120) registrar?: string;
  @IsOptional() @IsString() @MaxLength(120) platform?: string;
  @IsOptional() @IsString() purpose?: string;
  @IsOptional() @IsNumberString() price?: string;
  @IsOptional() @IsBoolean() autoRenew?: boolean;
  @IsOptional() @IsString() @MaxLength(120) status?: string;
  @IsOptional() @IsUUID() linkedProjectId?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() @MaxLength(200) workspace?: string;
  @IsOptional() @IsEmail() @MaxLength(160) billingEmail?: string;
  /** Team member's email — soft reference (`team_members.email`). */
  @IsOptional() @IsEmail() @MaxLength(120) paidByEmail?: string;
  @IsOptional() @IsString() @MaxLength(120) paymentMethod?: string;
  @IsOptional() @IsString() @MaxLength(40) billingCycle?: string;
}
