import { IsEmail, IsNumberString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateRecurringDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) service?: string;
  @IsOptional() @IsString() purpose?: string | null;
  @IsOptional() @IsNumberString() amount?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) cycle?: string;
  @IsOptional() @IsString() @MaxLength(60) chargeDay?: string | null;
  @IsOptional() @IsEmail() @MaxLength(120) paidByEmail?: string | null;
  @IsOptional() @IsString() @MaxLength(200) billingAccount?: string | null;
}
