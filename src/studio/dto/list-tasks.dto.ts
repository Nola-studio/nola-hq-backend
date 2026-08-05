import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsUUID } from 'class-validator';
import type { StudioTaskStatus } from '../../work-items/work-item-studio-mapping';
import type { WorkItemCategory } from '../../work-items/work-item.entity';
import { TASK_CATEGORIES, TASK_STATUSES } from './create-task.dto';

export class ListTasksDto {
  @IsOptional() @IsEmail() assignee?: string;
  @IsOptional() @IsIn(TASK_CATEGORIES as unknown as string[]) category?: WorkItemCategory;
  @IsOptional() @IsUUID() project?: string;
  @IsOptional() @IsIn(TASK_STATUSES as unknown as string[]) status?: StudioTaskStatus;
  /** Only tasks whose due date has passed and are not done. */
  @IsOptional()
  @Type(() => Boolean)
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  late?: boolean;
}
