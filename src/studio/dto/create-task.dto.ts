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
import type { StudioTaskPriority, StudioTaskStatus } from '../../work-items/work-item-studio-mapping';
import type { WorkItemCategory } from '../../work-items/work-item.entity';

export const TASK_STATUSES: StudioTaskStatus[] = [
  'todo',
  'in_progress',
  'blocked',
  'review',
  'resolved',
  'closed',
];

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
 * POST /studio/tasks — Studio's original request shape, kept for the Studio
 * frontend. Internally translated and delegated to `WorkItemsService`
 * (`work_items` is the unified task backbone post-merge) by
 * `StudioProjectsProxyService`. `identifier` is assigned server-side, never
 * accepted from the client.
 */
export class CreateTaskDto {
  @IsUUID() projectId!: string;
  @IsString() @MinLength(1) @MaxLength(500) title!: string;
  @IsIn(TASK_CATEGORIES as unknown as string[]) category!: WorkItemCategory;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(TASK_STATUSES as unknown as string[]) status?: StudioTaskStatus;
  /** Team member's email — soft reference (`team_members.email`). */
  @IsOptional() @IsEmail() @MaxLength(120) assigneeEmail?: string;
  @IsOptional() @Matches(DATE_PATTERN) dueDate?: string;
  @IsOptional() @IsIn(TASK_PRIORITIES as unknown as string[]) priority?: StudioTaskPriority;
  @IsOptional() @IsUUID() meetingId?: string;
  @IsOptional() @IsInt() @Min(0) position?: number;
  /** L'estimation, en points — voir `UpdateTaskDto.points`. */
  @IsOptional() @IsInt() @Min(0) @Max(999) points?: number;
  @IsOptional() @IsNumberString() hoursSpent?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) progressPercent?: number;
}
