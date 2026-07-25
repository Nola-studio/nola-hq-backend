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
 * POST /roadmap/initiatives/:id/milestones — an execution checkpoint.
 *
 * Adding the first milestone flips the parent initiative's progress from
 * "manually set" to "derived from the checklist".
 *
 * `position` defaults to the end of the initiative's checklist.
 */
export class CreateMilestoneDto {
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsOptional() @Matches(DATE_PATTERN) dueDate?: string;
  @IsOptional() @IsBoolean() done?: boolean;
  @IsOptional() @IsInt() @Min(0) position?: number;
}
