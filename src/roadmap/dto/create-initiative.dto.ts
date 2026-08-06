import {
  IsEmail,
  IsIn,
  IsInt,
  IsNumberString,
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
  /** USD, decimal string. */
  @IsOptional() @IsNumberString() budget?: string;
  @IsOptional() @IsNumberString() cost?: string;
}
