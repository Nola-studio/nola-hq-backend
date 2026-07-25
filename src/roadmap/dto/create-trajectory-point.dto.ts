import { IsNumber, IsOptional, IsString, Matches } from 'class-validator';
import { DATE_PATTERN } from './create-initiative.dto';

/**
 * POST /roadmap/key-results/:id/points — one step of the planned trajectory.
 *
 * `targetValue` is the PLANNED value at that date (what the on-track verdict
 * compares against). `actualValue` is the measured one and is only read for
 * a **manual** key result — a metric-bound one takes its actuals from
 * `metric_snapshots`.
 *
 * One point per date: re-posting the same date updates it in place.
 */
export class CreateTrajectoryPointDto {
  @Matches(DATE_PATTERN) date!: string;
  @IsOptional() @IsNumber() targetValue?: number | null;
  @IsOptional() @IsNumber() actualValue?: number | null;
  @IsOptional() @IsString() note?: string;
}
