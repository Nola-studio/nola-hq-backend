import {
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const STATUSES = [
  'healthy',
  'attention',
  'trial',
  'onboarding',
  'churn-risk',
  'suspended',
] as const;

/**
 * Body posted by the HQ Onboarding wizard.
 *
 * Legacy fields (owner, whatsapp, mobile_money, mrr_cdf, status, since,
 * ar_days, nps, users) drive the local CRM augmentation. New fields
 * (ownerFirstName/Last/Email, mobileMoneyPhone, address) trigger the
 * downstream provisioning call to kelasi-gateway
 * `POST /api/admin/hq-provision` which creates the Keycloak user,
 * IAM Person/Org/Membership, billing Subscription, svc-admin School,
 * Kriver merchant and fires the "Set your password" email through
 * Resend SMTP.
 *
 * The provisioning fields are optional in this DTO so legacy callers
 * (if any) keep working — the service decides whether to call kelasi
 * based on whether ownerEmail is present.
 */
export class CreateTenantDto {
  @IsOptional() @IsString() id?: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @Length(2, 2) country!: string;
  @IsString() city!: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
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

  // ── Real-provisioning fields (Phase 3) ──────────────────────────────
  @IsOptional() @IsString() @MaxLength(80) ownerFirstName?: string;
  @IsOptional() @IsString() @MaxLength(80) ownerLastName?: string;
  @IsOptional() @IsEmail() @MaxLength(120) ownerEmail?: string;
  @IsOptional() @IsString() @Matches(/^\+\d{8,15}$/) mobileMoneyPhone?: string;
}
