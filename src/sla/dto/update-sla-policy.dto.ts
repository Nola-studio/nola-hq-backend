import { IsInt, IsOptional, Min } from 'class-validator';

/** `businessUnitCode`/`priority` are deliberately absent — immutable once created. Passing `null` clears a target back to "unconfigured". */
export class UpdateSlaPolicyDto {
  @IsOptional() @IsInt() @Min(1) responseTargetMinutes?: number | null;
  @IsOptional() @IsInt() @Min(1) resolutionTargetMinutes?: number | null;
}
