import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { OBJECTIVE_STATUSES, QUARTER_PATTERN } from './create-objective.dto';

/**
 * PATCH /roadmap/objectives/:id — every field optional. Passing `null` on
 * `description`, `quarter` or `owner` clears it; omitting a field leaves it
 * untouched.
 */
export class UpdateObjectiveDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) title?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @Matches(QUARTER_PATTERN) quarter?: string | null;
  @IsOptional() @IsIn(OBJECTIVE_STATUSES as unknown as string[])
  status?: (typeof OBJECTIVE_STATUSES)[number];
  @IsOptional() @IsEmail() @MaxLength(120) owner?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(100) progress?: number;
}
