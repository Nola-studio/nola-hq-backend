import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { METRIC_KEYS } from '../../analytics/snapshot.metrics';
import {
  KEY_RESULT_DIRECTIONS,
  KEY_RESULT_UNITS,
  type KeyResultDirection,
  type KeyResultUnit,
} from '../roadmap.trajectory';

/**
 * PATCH /roadmap/key-results/:id — every field optional. Passing `null` on
 * `metricKey` unbinds the key result from its metric (its actuals then come
 * back from the trajectory points); binding it to a metric re-applies that
 * metric's `unit` / `direction` unless the payload sets them explicitly.
 */
export class UpdateKeyResultDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) label?: string;
  @IsOptional() @IsIn(METRIC_KEYS) @MaxLength(64) metricKey?: string | null;
  @IsOptional() @IsIn(KEY_RESULT_UNITS as unknown as string[])
  unit?: KeyResultUnit;
  @IsOptional() @IsNumber() baseline?: number;
  @IsOptional() @IsNumber() target?: number;
  @IsOptional() @IsIn(KEY_RESULT_DIRECTIONS as unknown as string[])
  direction?: KeyResultDirection;
  @IsOptional() @IsInt() @Min(0) position?: number;
}
