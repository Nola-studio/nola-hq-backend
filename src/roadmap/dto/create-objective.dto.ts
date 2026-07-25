import {
  IsEmail,
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

export const OBJECTIVE_STATUSES = [
  'draft',
  'active',
  'achieved',
  'missed',
  'dropped',
] as const;

/** `2026-Q3` — the only accepted quarter format across the roadmap. */
export const QUARTER_PATTERN = /^\d{4}-Q[1-4]$/;

/** `2026` — an **annual** objective carries a year and no quarter. */
export const YEAR_PATTERN = /^\d{4}$/;

/**
 * POST /roadmap/objectives — a strategic objective.
 *
 * Horizon: `year` **or** `quarter`, never both (400). An objective with a
 * `year` is the annual one; the quarterly objectives serving it carry its id
 * in `parentId`. The chain is capped at two levels (400 beyond).
 *
 * `progress` is only a starting fallback: as soon as the objective has key
 * results, children or initiatives, the API answers with the derived value.
 */
export class CreateObjectiveDto {
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsOptional() @IsString() description?: string;
  /** Annual objective this one serves. */
  @IsOptional() @IsUUID() parentId?: string;
  @IsOptional() @Matches(YEAR_PATTERN) year?: string;
  @IsOptional() @Matches(QUARTER_PATTERN) quarter?: string;
  @IsOptional() @IsIn(OBJECTIVE_STATUSES as unknown as string[])
  status?: (typeof OBJECTIVE_STATUSES)[number];
  /** Accountable team member — their `team_members.email`. */
  @IsOptional() @IsEmail() @MaxLength(120) owner?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) progress?: number;
}
