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
import { DATE_PATTERN, TASK_CATEGORIES, TASK_PRIORITIES, TASK_STATUSES } from './create-task.dto';

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
  @IsOptional() @IsIn(TASK_CATEGORIES as unknown as string[]) category?: WorkItemCategory;
  @IsOptional() @IsEmail() @MaxLength(120) assigneeEmail?: string | null;
  @IsOptional() @Matches(DATE_PATTERN) dueDate?: string | null;
  @IsOptional() @IsIn(TASK_PRIORITIES as unknown as string[]) priority?: StudioTaskPriority;
  @IsOptional() @IsUUID() meetingId?: string | null;
  @IsOptional() @IsInt() @Min(0) position?: number;
  @IsOptional() @IsNumberString() hoursSpent?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(100) progressPercent?: number | null;
}
