import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { StudioPeriodMode } from '../studio.dashboard-period';

export const PERIOD_MODES = ['ytd', 'month', 'year'] as const;

export class GetDashboardDto {
  @IsOptional() @IsIn(PERIOD_MODES as unknown as string[]) period?: StudioPeriodMode;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) month?: number;
  /** "Inclure les archivés" — off by default, every aggregation excludes archived projects and their tasks. */
  @IsOptional()
  @Type(() => Boolean)
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived?: boolean;
}
