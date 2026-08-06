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
import {
  DATE_PATTERN,
  HEX_COLOR_PATTERN,
  INITIATIVE_HEALTH_STATUSES,
  INITIATIVE_KINDS,
  INITIATIVE_TYPES,
} from './create-initiative.dto';

/**
 * PATCH /roadmap/initiatives/:id — every field optional. Passing `null`
 * clears a nullable field; omitting it leaves it untouched.
 *
 * Changing `status` here does **not** reorder the kanban column — use
 * `POST /roadmap/initiatives/:id/move` for that.
 */
export class UpdateInitiativeDto {
  @IsOptional() @IsUUID() objectiveId?: string | null;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) title?: string;
  @IsOptional() @IsString() summary?: string | null;
  @IsOptional() @IsIn(INITIATIVE_KINDS as unknown as string[])
  kind?: RoadmapInitiativeKind;
  @IsOptional() @IsIn(INITIATIVE_STATUSES as unknown as string[])
  status?: RoadmapInitiativeStatus;
  @IsOptional() @IsIn(INITIATIVE_PRIORITIES as unknown as string[])
  priority?: RoadmapInitiativePriority;
  @IsOptional() @Matches(HEX_COLOR_PATTERN) color?: string;
  @IsOptional() @IsIn(INITIATIVE_HEALTH_STATUSES as unknown as string[])
  healthStatus?: RoadmapInitiativeHealthStatus | null;
  @IsOptional() @IsIn(INITIATIVE_TYPES as unknown as string[])
  type?: RoadmapInitiativeType | null;
  @IsOptional() @Matches(QUARTER_PATTERN) quarter?: string | null;
  @IsOptional() @Matches(DATE_PATTERN) startDate?: string | null;
  @IsOptional() @Matches(DATE_PATTERN) targetDate?: string | null;
  @IsOptional() @IsEmail() @MaxLength(120) owner?: string | null;
  @IsOptional() @IsString() @MaxLength(64) appId?: string | null;
  @IsOptional() @IsString() @MaxLength(120) tenantId?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(100) progress?: number;
  @IsOptional() @IsNumberString() budget?: string | null;
  @IsOptional() @IsNumberString() cost?: string | null;
}
