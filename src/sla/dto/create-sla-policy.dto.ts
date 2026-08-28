import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

const PRIORITIES = ['P1', 'P2', 'P3'] as const;

export class CreateSlaPolicyDto {
  /** Resolved server-side, same convention as `businessUnitCode` elsewhere. */
  @IsString() businessUnitCode!: string;

  /** Immutable once created, along with `businessUnitCode` — see `UpdateSlaPolicyDto`. */
  @IsIn(PRIORITIES as unknown as string[])
  priority!: (typeof PRIORITIES)[number];

  @IsOptional() @IsInt() @Min(1) responseTargetMinutes?: number;
  @IsOptional() @IsInt() @Min(1) resolutionTargetMinutes?: number;
}
