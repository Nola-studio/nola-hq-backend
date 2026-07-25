import { IsIn, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import type {
  RoadmapInitiativeKind,
  RoadmapInitiativeStatus,
} from '../roadmap-initiative.entity';
import { INITIATIVE_STATUSES } from '../roadmap.board';
import { OBJECTIVE_STATUSES, QUARTER_PATTERN } from './create-objective.dto';
import { INITIATIVE_KINDS } from './create-initiative.dto';

/** Query filters for `GET /roadmap/objectives`. */
export class ListObjectivesDto {
  @IsOptional() @Matches(QUARTER_PATTERN) quarter?: string;
  @IsOptional() @IsIn(OBJECTIVE_STATUSES as unknown as string[])
  status?: (typeof OBJECTIVE_STATUSES)[number];
}

/** Query filters for `GET /roadmap/initiatives`. */
export class ListInitiativesDto {
  @IsOptional() @IsIn(INITIATIVE_STATUSES as unknown as string[])
  status?: RoadmapInitiativeStatus;
  @IsOptional() @Matches(QUARTER_PATTERN) quarter?: string;
  @IsOptional() @IsUUID() objectiveId?: string;
  @IsOptional() @IsString() appId?: string;
  @IsOptional() @IsIn(INITIATIVE_KINDS as unknown as string[])
  kind?: RoadmapInitiativeKind;
  @IsOptional() @IsString() owner?: string;
}
