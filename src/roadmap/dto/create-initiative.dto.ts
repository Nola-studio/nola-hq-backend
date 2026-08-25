import {
  IsBoolean,
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
import type {
  RoadmapInitiativeCountry,
  RoadmapInitiativeHealthStatus,
  RoadmapInitiativeKind,
  RoadmapInitiativePriority,
  RoadmapInitiativeStatus,
  RoadmapInitiativeType,
} from '../roadmap-initiative.entity';
import {
  INITIATIVE_PRIORITIES,
  INITIATIVE_STATUSES,
} from '../roadmap.board';
import { QUARTER_PATTERN } from './create-objective.dto';

export const INITIATIVE_KINDS = ['product', 'tech', 'gtm', 'ops'] as const;
export const INITIATIVE_TYPES = [
  'infrastructure_cloud',
  'web_app_development',
  'mobile_app_development',
  'website',
  'administrative',
  'maintenance_support',
  'other',
] as const;
export const INITIATIVE_HEALTH_STATUSES = ['on_track', 'on_hold', 'behind', 'completed'] as const;
/**
 * Full ISO 3166-1 alpha-2 list (249 codes), sourced from mledoze/countries
 * (github.com/mledoze/countries), filtered to `status: "officially-assigned"`.
 * Keep in sync with RoadmapInitiativeCountry in ../roadmap-initiative.entity.ts.
 */
export const INITIATIVE_COUNTRIES = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW',
] as const;
/**
 * Not a field on this DTO — `scope` is forced server-side by which endpoint
 * creates the row (`RoadmapController.createInitiative` → `'initiative'`,
 * `StudioProjectsProxyService.createProject` → `'project'`), never accepted
 * from the client. Exported here for `UpdateScopeDto` and the Studio
 * projects list filter to share.
 */
export const INITIATIVE_SCOPES = ['project', 'initiative'] as const;
export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/** `2026-07-25` — plain calendar day, matching the `date` columns. */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /roadmap/initiatives — a project/workstream under an objective.
 *
 * `appId` and `tenantId` are **soft** references (apps live in an in-memory
 * JetStream projection, tenants are owned by nola-billing): they are stored
 * verbatim and never validated against a registry.
 *
 * `progress` only matters while the initiative has no milestone — once it
 * has one, the API answers with `done / total`.
 */
export class CreateInitiativeDto {
  @IsOptional() @IsUUID() objectiveId?: string;
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsOptional() @IsString() summary?: string;
  @IsOptional() @IsIn(INITIATIVE_KINDS as unknown as string[])
  kind?: RoadmapInitiativeKind;
  @IsOptional() @IsIn(INITIATIVE_STATUSES as unknown as string[])
  status?: RoadmapInitiativeStatus;
  @IsOptional() @IsIn(INITIATIVE_PRIORITIES as unknown as string[])
  priority?: RoadmapInitiativePriority;
  @IsOptional() @Matches(HEX_COLOR_PATTERN) color?: string;
  @IsOptional() @IsIn(INITIATIVE_HEALTH_STATUSES as unknown as string[])
  healthStatus?: RoadmapInitiativeHealthStatus;
  @IsOptional() @IsIn(INITIATIVE_TYPES as unknown as string[])
  type?: RoadmapInitiativeType;
  @IsOptional() @Matches(QUARTER_PATTERN) quarter?: string;
  @IsOptional() @Matches(DATE_PATTERN) startDate?: string;
  @IsOptional() @Matches(DATE_PATTERN) targetDate?: string;
  /** Accountable team member — their `team_members.email`. */
  @IsOptional() @IsEmail() @MaxLength(120) owner?: string;
  @IsOptional() @IsString() @MaxLength(64) appId?: string;
  @IsOptional() @IsString() @MaxLength(120) tenantId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) progress?: number;
  @IsOptional() @IsIn(INITIATIVE_COUNTRIES as unknown as string[]) country?: RoadmapInitiativeCountry;
  /** BusinessUnit code, e.g. 'khi-lab' — not a UUID. Defaults to 'khi-lab' when omitted. */
  @IsOptional() @IsString() businessUnitCode?: string;
  @IsOptional() @IsBoolean() isInternal?: boolean;
}
