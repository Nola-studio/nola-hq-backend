import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import type { RoadmapInitiativeStatus } from '../roadmap-initiative.entity';
import { INITIATIVE_STATUSES } from '../roadmap.board';

/**
 * POST /roadmap/initiatives/:id/move — drag & drop on the kanban board.
 *
 * `position` is the 0-based rank the initiative must end up at in the target
 * column; an out-of-range value appends at the end rather than failing.
 * Defaults to the top of the column when omitted.
 */
export class MoveInitiativeDto {
  @IsIn(INITIATIVE_STATUSES as unknown as string[])
  status!: RoadmapInitiativeStatus;

  @IsOptional() @IsInt() @Min(0) position?: number;
}
