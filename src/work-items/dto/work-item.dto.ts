import { Type } from 'class-transformer';
import {
  IsIn,
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
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
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  WORK_ITEM_CATEGORIES,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_STATUSES,
  WORK_ITEM_TYPES,
  type WorkItemCategory,
  type WorkItemPriority,
  type WorkItemStatus,
  type WorkItemType,
  WORK_ITEM_SOURCE_KINDS,
  type WorkItemSourceKind,
} from '../work-item.entity';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ListWorkItemsDto extends PaginationDto {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() sprintId?: string;
  /** La version visée (REL-00) — « montre-moi ce qui part en 1.4 ». */
  @IsOptional() @IsUUID() releaseId?: string;
  @IsOptional() @IsIn(WORK_ITEM_STATUSES as unknown as string[])
  status?: WorkItemStatus;
  @IsOptional() @IsIn(WORK_ITEM_PRIORITIES as unknown as string[])
  priority?: WorkItemPriority;
  @IsOptional() @IsIn(WORK_ITEM_TYPES as unknown as string[])
  type?: WorkItemType;
  @IsOptional() @IsString() assignee?: string;
  /** Provenance — `request` isole ce que l'équipe a déposé, `manifest` un import de référentiel. */
  @IsOptional() @IsIn(WORK_ITEM_SOURCE_KINDS as unknown as string[])
  sourceKind?: WorkItemSourceKind;
}

/**
 * One-field capture (REQ-01). Everything else is deduced or left null, which
 * is the whole point: filing a need must cost a sentence, not a form. The
 * project, the category and the assignee are decided later on the board, by
 * whoever picks the item up — the tools for that already exist.
 */
export class CaptureWorkItemDto {
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(10_000) description?: string;
  /** Optional hint. `bug` and `feature` are the two a reporter actually knows. */
  @IsOptional() @IsIn(WORK_ITEM_TYPES as unknown as string[])
  type?: WorkItemType;
  @IsOptional() @IsIn(WORK_ITEM_PRIORITIES as unknown as string[])
  priority?: WorkItemPriority;
  /** Optional context, exactly as the retired `StudioRequest.projectId` was. */
  @IsOptional() @IsUUID() projectId?: string;
}

export class CreateWorkItemDto {
  @IsUUID() projectId!: string;
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(10_000) description?: string;
  @IsOptional() @IsIn(WORK_ITEM_TYPES as unknown as string[])
  type?: WorkItemType;
  @IsOptional() @IsIn(WORK_ITEM_STATUSES as unknown as string[])
  status?: WorkItemStatus;
  @IsOptional() @IsIn(WORK_ITEM_PRIORITIES as unknown as string[])
  priority?: WorkItemPriority;
  @IsOptional() @IsString() @MaxLength(160) assignee?: string;
  @IsOptional() @Matches(DATE_PATTERN) dueDate?: string;
  @IsOptional() @IsString() @MaxLength(2_000) blockedReason?: string;
  @IsOptional() @IsUUID() sprintId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) estimatePoints?: number;
  @IsOptional() @IsIn(WORK_ITEM_CATEGORIES as unknown as string[])
  category?: WorkItemCategory;
  @IsOptional() @IsNumberString() hoursSpent?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) progressPercent?: number;
  @IsOptional() @IsUUID() meetingId?: string;
}

export class UpdateWorkItemDto {
  @IsOptional() @IsUUID() projectId?: string;
  /** `null` détache. Les règles de forme sont dans `work-item-hierarchy.ts`. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) parentId?: number | null;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(10_000) description?: string | null;
  @IsOptional() @IsIn(WORK_ITEM_TYPES as unknown as string[])
  type?: WorkItemType;
  @IsOptional() @IsIn(WORK_ITEM_PRIORITIES as unknown as string[])
  priority?: WorkItemPriority;
  @IsOptional() @IsString() @MaxLength(160) assignee?: string | null;
  @IsOptional() @Matches(DATE_PATTERN) dueDate?: string | null;
  @IsOptional() @IsString() @MaxLength(2_000) blockedReason?: string | null;
  @IsOptional() @IsUUID() sprintId?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) estimatePoints?: number;
  @IsOptional() @IsIn(WORK_ITEM_CATEGORIES as unknown as string[])
  category?: WorkItemCategory | null;
  @IsOptional() @IsNumberString() hoursSpent?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) progressPercent?: number | null;
  @IsOptional() @IsUUID() meetingId?: string | null;
}

export class MoveWorkItemDto {
  @IsIn(WORK_ITEM_STATUSES as unknown as string[])
  status!: WorkItemStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000)
  position?: number;
}

export class AddWorkItemCommentDto {
  @IsString() @MinLength(1) @MaxLength(10_000) body!: string;
}

export class AddWorkItemSubtaskDto {
  @IsString() @MinLength(2) @MaxLength(240) title!: string;
  @IsOptional() @IsString() @MaxLength(160) assignee?: string;
}

export class UpdateWorkItemSubtaskDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(240) title?: string;
  @IsOptional() @IsIn([true, false]) done?: boolean;
  @IsOptional() @IsString() @MaxLength(160) assignee?: string | null;
}

/**
 * Un lot de propositions à accepter ou à écarter.
 *
 * Le plafond est celui d'un geste humain qui reste réversible : un référentiel
 * complet fait une centaine d'items, et accepter mille tickets d'un clic
 * n'est plus une décision, c'est un accident.
 */
export class DecideTriageDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids!: number[];
}
