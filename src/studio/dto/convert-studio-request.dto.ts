import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import type { StudioTaskPriority } from '../../work-items/work-item-studio-mapping';
import type { WorkItemCategory } from '../../work-items/work-item.entity';
import { DATE_PATTERN, TASK_CATEGORIES, TASK_PRIORITIES } from './create-task.dto';

/**
 * POST /studio/requests/:id/convert — files the ticket that resolving this
 * request requires. `projectId`/`category` are required (same as
 * `CreateTaskDto`, which this delegates to); everything else defaults from
 * the request itself (title, description, priority, assignee) but can be
 * overridden here before filing.
 */
export class ConvertStudioRequestDto {
  @IsUUID() projectId!: string;
  @IsIn(TASK_CATEGORIES as unknown as string[]) category!: WorkItemCategory;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(TASK_PRIORITIES as unknown as string[]) priority?: StudioTaskPriority;
  @IsOptional() @IsEmail() @MaxLength(120) assigneeEmail?: string;
  @IsOptional() @Matches(DATE_PATTERN) dueDate?: string;
}
