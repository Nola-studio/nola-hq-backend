import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import type { StudioTaskStatus } from '../../work-items/work-item-studio-mapping';
import { TASK_STATUSES } from './create-task.dto';

/**
 * Archive/search across every task regardless of age or board column —
 * unlike `ListTasksDto` (the live board's filter shape), this is paginated
 * (`page`/`limit`/`q` via `PaginationDto`) since it's meant to reach past
 * whatever recency window the live board applies.
 */
export class SearchTasksDto extends PaginationDto {
  @IsOptional() @IsUUID() project?: string;
  @IsOptional() @IsIn(TASK_STATUSES as unknown as string[]) status?: StudioTaskStatus;
  /** La version visée — le filtre demandé pour préparer un déploiement. */
  @IsOptional() @IsUUID() release?: string;
}
