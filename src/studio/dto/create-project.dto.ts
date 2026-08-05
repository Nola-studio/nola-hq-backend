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
import { Transform } from 'class-transformer';
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
 * Studio frontend. `key` becomes the `keyPrefix` of the underlying
 * `RoadmapInitiative` (`roadmap_initiatives` is the unified project
 * backbone post-merge), so it's restricted to the same shape as the
 * original hand-picked defaults: uppercase letters/digits, starting with a
 * letter. Immutable once set — see `UpdateProjectDto`.
 *
 * `budget`/`cost` are accepted but not persisted — `RoadmapInitiative` has
 * no equivalent columns, and the real workbook has both empty for every
 * project anyway.
 */
export class CreateProjectDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(/^[A-Z][A-Z0-9]{1,9}$/, {
    message: 'Le code doit faire 2 à 10 caractères alphanumériques (majuscules), et commencer par une lettre.',
  })
  key!: string;

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
