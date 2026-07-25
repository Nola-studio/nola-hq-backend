import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DATE_PATTERN } from './create-initiative.dto';

/**
 * PATCH /roadmap/milestones/:id — every field optional. Passing `null` on
 * `dueDate` clears it.
 */
export class UpdateMilestoneDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) title?: string;
  @IsOptional() @Matches(DATE_PATTERN) dueDate?: string | null;
  @IsOptional() @IsBoolean() done?: boolean;
  @IsOptional() @IsInt() @Min(0) position?: number;
}
