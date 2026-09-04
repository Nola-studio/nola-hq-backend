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
 * POST /roadmap/objectives/:id/key-results — how the objective is measured.
 *
 * `metricKey` binds the key result to one of the seven global metrics
 * (`METRIC_KEYS`, the single source of truth in
 * `src/analytics/snapshot.metrics.ts`): the actuals then come from
 * `metric_snapshots` and no manual entry is needed. `unit` and `direction`
 * default from that metric's definition when it is set.
 *
 * `position` defaults to the end of the objective's key result list.
 */
export class CreateKeyResultDto {
  @IsString() @MinLength(2) @MaxLength(200) label!: string;
  @IsOptional() @IsIn(METRIC_KEYS) @MaxLength(64) metricKey?: string;
  @IsOptional() @IsIn(KEY_RESULT_UNITS as unknown as string[])
  unit?: KeyResultUnit;
  @IsNumber() baseline!: number;
  @IsNumber() target!: number;
  @IsOptional() @IsIn(KEY_RESULT_DIRECTIONS as unknown as string[])
  direction?: KeyResultDirection;
  @IsOptional() @IsInt() @Min(0) position?: number;
}
