import { IsIn, IsOptional } from 'class-validator';
import type { RoadmapInitiativeScope } from '../roadmap-initiative.entity';
import { INITIATIVE_SCOPES } from './create-initiative.dto';

/**
 * GET /roadmap/board and /roadmap/timeline — omit `scope` to get every
 * `roadmap_initiatives` row (durable products and bounded work alike, the
 * shape other screens' project pickers need); Roadmap's own board/timeline
 * pass `scope=initiative` to see only what they're meant to show.
 */
export class BoardQueryDto {
  @IsOptional() @IsIn(INITIATIVE_SCOPES as unknown as string[]) scope?: RoadmapInitiativeScope;
}
