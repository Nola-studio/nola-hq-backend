import {
  IsEmail,
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import type {
  RoadmapInitiativeHealthStatus,
  RoadmapInitiativeType,
} from '../../roadmap/roadmap-initiative.entity';
import { DATE_PATTERN } from './create-task.dto';

/** `#RRGGBB`. */
export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export const PROJECT_TYPES = [
  'infrastructure_cloud',
  'web_app_development',
  'mobile_app_development',
  'website',
  'administrative',
  'maintenance_support',
  'other',
] as const;
export const PROJECT_PRIORITIES = ['high', 'medium', 'low'] as const;
export type StudioProjectPriority = (typeof PROJECT_PRIORITIES)[number];
export const PROJECT_HEALTH_STATUSES = ['on_track', 'on_hold', 'behind', 'completed'] as const;

/**
 * POST /studio/projects — Studio's original request shape, kept for the
 * Studio frontend. The project's identifier (`keyPrefix` on the underlying
 * `RoadmapInitiative`) is auto-generated from `name` — never accepted from
 * the client.
 *
 * `budget`/`cost` persist to `RoadmapInitiative.budget`/`.cost` (USD,
 * decimal string) — the real workbook has both empty for every project, so
 * expect `null` until someone fills them in.
 */
export class CreateProjectDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;

  @IsOptional() @IsString() @MaxLength(2000) description?: string;

  @IsString() @Matches(HEX_COLOR_PATTERN, { message: 'La couleur doit être un hex #RRGGBB.' }) color!: string;

  @IsOptional() @IsEmail() @MaxLength(120) ownerEmail?: string;

  @IsOptional() @IsIn(PROJECT_TYPES as unknown as string[]) type?: RoadmapInitiativeType;
  @IsOptional() @IsIn(PROJECT_PRIORITIES as unknown as string[]) priority?: StudioProjectPriority;
  @IsOptional() @IsIn(PROJECT_HEALTH_STATUSES as unknown as string[]) healthStatus?: RoadmapInitiativeHealthStatus;
  @IsOptional() @IsNumberString() budget?: string;
  @IsOptional() @IsNumberString() cost?: string;
  @IsOptional() @Matches(DATE_PATTERN) startDate?: string;
  @IsOptional() @Matches(DATE_PATTERN) dueDate?: string;
  @IsOptional() @IsEmail() @MaxLength(120) leadAssigneeEmail?: string;
}
