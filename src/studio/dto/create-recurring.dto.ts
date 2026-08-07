import { IsEmail, IsNumberString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRecurringDto {
  @IsString() @MinLength(1) @MaxLength(200) service!: string;
  @IsOptional() @IsString() purpose?: string;
  @IsNumberString() amount!: string;
  @IsString() @MinLength(1) @MaxLength(60) cycle!: string;
  @IsOptional() @IsString() @MaxLength(60) chargeDay?: string;
  /** Team member's email — soft reference (`team_members.email`). */
  @IsOptional() @IsEmail() @MaxLength(120) paidByEmail?: string;
  @IsOptional() @IsString() @MaxLength(200) billingAccount?: string;
}
