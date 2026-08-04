import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import type { StudioTaskStatus } from '../studio-task.entity';
import { TASK_STATUSES } from '../studio.board';

/**
 * POST /studio/tasks/:id/move — drag & drop on the kanban board.
 *
 * `position` is the 0-based rank the task must end up at in the target
 * column; an out-of-range value appends at the end rather than failing.
 * Defaults to the top of the column when omitted.
 */
export class MoveTaskDto {
  @IsIn(TASK_STATUSES as unknown as string[])
  status!: StudioTaskStatus;

  @IsOptional() @IsInt() @Min(0) position?: number;
}
