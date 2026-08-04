import { IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Min, MaxLength, MinLength } from 'class-validator';
import type { StudioTaskCategory, StudioTaskPriority, StudioTaskStatus } from '../studio-task.entity';
import { TASK_STATUSES } from '../studio.board';
import { DATE_PATTERN, TASK_CATEGORIES, TASK_PRIORITIES } from './create-task.dto';

/** Same shape as CreateTaskDto minus `meetingId`, which comes from the route param. */
export class CreateMeetingTaskDto {
  @IsUUID() projectId!: string;
  @IsString() @MinLength(1) @MaxLength(500) title!: string;
  @IsIn(TASK_CATEGORIES as unknown as string[]) category!: StudioTaskCategory;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(TASK_STATUSES as unknown as string[]) status?: StudioTaskStatus;
  @IsOptional() @IsEmail() @MaxLength(120) assigneeEmail?: string;
  @IsOptional() @Matches(DATE_PATTERN) dueDate?: string;
  @IsOptional() @IsIn(TASK_PRIORITIES as unknown as string[]) priority?: StudioTaskPriority;
  @IsOptional() @IsInt() @Min(0) position?: number;
}
