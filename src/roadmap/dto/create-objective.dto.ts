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

export const OBJECTIVE_STATUSES = [
  'draft',
  'active',
  'achieved',
  'missed',
  'dropped',
] as const;

/** `2026-Q3` — the only accepted quarter format across the roadmap. */
export const QUARTER_PATTERN = /^\d{4}-Q[1-4]$/;

/**
 * POST /roadmap/objectives — a quarterly strategic objective.
 *
 * `progress` is only a starting fallback: as soon as the objective has
 * initiatives, the API answers with the mean of their progress.
 */
export class CreateObjectiveDto {
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Matches(QUARTER_PATTERN) quarter?: string;
  @IsOptional() @IsIn(OBJECTIVE_STATUSES as unknown as string[])
  status?: (typeof OBJECTIVE_STATUSES)[number];
  /** Accountable team member — their `team_members.email`. */
  @IsOptional() @IsEmail() @MaxLength(120) owner?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) progress?: number;
}
