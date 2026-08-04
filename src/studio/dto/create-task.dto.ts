import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type {
  StudioTaskCategory,
  StudioTaskPriority,
  StudioTaskStatus,
} from '../studio-task.entity';
import { TASK_STATUSES } from '../studio.board';

export const TASK_CATEGORIES = [
  'product',
  'sales',
  'brand',
  'admin_legal',
  'infra',
] as const;

export const TASK_PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const;

/** `2026-07-25` — plain calendar day, matching the `date` column. */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /studio/tasks — `identifier` (e.g. `YEK-42`) is assigned server-side
 * from `projectId`, never accepted from the client.
 */
export class CreateTaskDto {
  @IsUUID() projectId!: string;
  @IsString() @MinLength(1) @MaxLength(500) title!: string;
  @IsIn(TASK_CATEGORIES as unknown as string[]) category!: StudioTaskCategory;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(TASK_STATUSES as unknown as string[]) status?: StudioTaskStatus;
  /** Team member's email — soft reference (`team_members.email`). */
  @IsOptional() @IsEmail() @MaxLength(120) assigneeEmail?: string;
  @IsOptional() @Matches(DATE_PATTERN) dueDate?: string;
  @IsOptional() @IsIn(TASK_PRIORITIES as unknown as string[]) priority?: StudioTaskPriority;
  @IsOptional() @IsUUID() meetingId?: string;
  @IsOptional() @IsInt() @Min(0) position?: number;
}
