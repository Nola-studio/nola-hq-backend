import { IsIn, IsOptional } from 'class-validator';
import type { RoadmapInitiativeScope } from '../../roadmap/roadmap-initiative.entity';
import { INITIATIVE_SCOPES } from '../../roadmap/dto/create-initiative.dto';

/**
 * GET /studio/projects — omit `scope` to get every workstream (both durable
 * products and bounded initiatives), the shape the task composer's project
 * picker needs to group by scope. Pass `scope=project` for the dedicated
 * `/projects` screen, which must never see bounded initiatives.
 */
export class ListStudioProjectsDto {
  @IsOptional() @IsIn(INITIATIVE_SCOPES as unknown as string[]) scope?: RoadmapInitiativeScope;
}
