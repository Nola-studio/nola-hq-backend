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
import { DATE_PATTERN, TASK_CATEGORIES, TASK_PRIORITIES } from './create-task.dto';

/**
 * PATCH /studio/tasks/:id — every field optional. Passing `null` clears a
 * nullable field; omitting it leaves it untouched.
 *
 * Changing `status` here does **not** reorder the kanban column — use
 * `POST /studio/tasks/:id/move` for that.
 */
export class UpdateTaskDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500) title?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsIn(TASK_STATUSES as unknown as string[]) status?: StudioTaskStatus;
  @IsOptional() @IsIn(TASK_CATEGORIES as unknown as string[]) category?: StudioTaskCategory;
  @IsOptional() @IsEmail() @MaxLength(120) assigneeEmail?: string | null;
  @IsOptional() @Matches(DATE_PATTERN) dueDate?: string | null;
  @IsOptional() @IsIn(TASK_PRIORITIES as unknown as string[]) priority?: StudioTaskPriority;
  @IsOptional() @IsUUID() meetingId?: string | null;
  @IsOptional() @IsInt() @Min(0) position?: number;
}
