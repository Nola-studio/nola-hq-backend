import { IsIn } from 'class-validator';
import type { RoadmapInitiativeScope } from '../roadmap-initiative.entity';
import { INITIATIVE_SCOPES } from './create-initiative.dto';

/**
 * PATCH /roadmap/initiatives/:id/scope — `hq:owner` only (see
 * `RoadmapController`). `scope` is otherwise immutable once set at creation
 * — this is the one deliberate escape hatch, for reclassifying a row that
 * was filed under the wrong screen (e.g. a durable product mistakenly
 * created as a bounded initiative, or vice versa). Unlike `updateKeyPrefix`
 * there is no "already referenced" guard: crossing scopes has no knock-on
 * identifier concerns, see `RoadmapService.updateScope`.
 */
export class UpdateScopeDto {
  @IsIn(INITIATIVE_SCOPES as unknown as string[]) scope!: RoadmapInitiativeScope;
}
