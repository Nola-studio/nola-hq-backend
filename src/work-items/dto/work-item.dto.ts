import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
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
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_STATUSES,
  WORK_ITEM_TYPES,
  type WorkItemPriority,
  type WorkItemStatus,
  type WorkItemType,
} from '../work-item.entity';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ListWorkItemsDto extends PaginationDto {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsIn(WORK_ITEM_STATUSES as unknown as string[])
  status?: WorkItemStatus;
  @IsOptional() @IsIn(WORK_ITEM_PRIORITIES as unknown as string[])
  priority?: WorkItemPriority;
  @IsOptional() @IsIn(WORK_ITEM_TYPES as unknown as string[])
  type?: WorkItemType;
  @IsOptional() @IsString() assignee?: string;
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
}

export class UpdateWorkItemDto {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(10_000) description?: string | null;
  @IsOptional() @IsIn(WORK_ITEM_TYPES as unknown as string[])
  type?: WorkItemType;
  @IsOptional() @IsIn(WORK_ITEM_PRIORITIES as unknown as string[])
  priority?: WorkItemPriority;
  @IsOptional() @IsString() @MaxLength(160) assignee?: string | null;
  @IsOptional() @Matches(DATE_PATTERN) dueDate?: string | null;
  @IsOptional() @IsString() @MaxLength(2_000) blockedReason?: string | null;
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
