import { IsNumber, IsOptional, IsString, Matches } from 'class-validator';
import { DATE_PATTERN } from './create-initiative.dto';

/**
 * PATCH /roadmap/trajectory-points/:id — every field optional. Passing `null`
 * on `targetValue` / `actualValue` / `note` clears it; moving a point onto a
 * date its key result already uses is rejected (409).
 */
export class UpdateTrajectoryPointDto {
  @IsOptional() @Matches(DATE_PATTERN) date?: string;
  @IsOptional() @IsNumber() targetValue?: number | null;
  @IsOptional() @IsNumber() actualValue?: number | null;
  @IsOptional() @IsString() note?: string | null;
}
