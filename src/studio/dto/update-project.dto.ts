import { IsEmail, IsIn, IsNumberString, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type {
  StudioProjectHealthStatus,
  StudioProjectPriority,
  StudioProjectType,
} from '../studio-project.entity';
import {
  HEX_COLOR_PATTERN,
  PROJECT_HEALTH_STATUSES,
  PROJECT_PRIORITIES,
  PROJECT_TYPES,
} from './create-project.dto';
import { DATE_PATTERN } from './create-task.dto';

/**
 * PATCH /studio/projects/:id — everything but `key` (immutable — see
 * `CreateProjectDto`) and `status` (toggled via the dedicated
 * archive/unarchive endpoints, not a free-form field here).
 */
export class UpdateProjectDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsOptional() @IsString() @Matches(HEX_COLOR_PATTERN, { message: 'La couleur doit être un hex #RRGGBB.' }) color?: string;
  @IsOptional() @IsEmail() @MaxLength(120) ownerEmail?: string | null;

  @IsOptional() @IsIn(PROJECT_TYPES as unknown as string[]) type?: StudioProjectType | null;
  @IsOptional() @IsIn(PROJECT_PRIORITIES as unknown as string[]) priority?: StudioProjectPriority | null;
  @IsOptional() @IsIn(PROJECT_HEALTH_STATUSES as unknown as string[]) healthStatus?: StudioProjectHealthStatus | null;
  @IsOptional() @IsNumberString() budget?: string | null;
  @IsOptional() @IsNumberString() cost?: string | null;
  @IsOptional() @Matches(DATE_PATTERN) startDate?: string | null;
  @IsOptional() @Matches(DATE_PATTERN) dueDate?: string | null;
  @IsOptional() @IsEmail() @MaxLength(120) leadAssigneeEmail?: string | null;
}
