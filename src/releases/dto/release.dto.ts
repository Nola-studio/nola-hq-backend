import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { RELEASE_STATUSES, type ReleaseStatus } from '../release.entity';

/** `2026-10-15` — jour calendaire, comme les autres dates du dépôt. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateReleaseDto {
  /**
   * Le numéro, tel qu'on l'écrit. Aucune forme imposée au-delà de la
   * longueur : le versionnage sémantique n'est pas le seul en usage dans le
   * groupe, et refuser « 2026.10 » n'apporterait rien.
   */
  @IsString() @MinLength(1) @MaxLength(32) version!: string;

  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsIn(RELEASE_STATUSES as unknown as string[]) status?: ReleaseStatus;
  @IsOptional() @Matches(DATE_PATTERN) targetDate?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}

/**
 * `releasedAt` est absent volontairement : il se date par le passage à
 * `released`. Le rendre saisissable permettrait de dater une livraison qui
 * n'a pas eu lieu.
 */
export class UpdateReleaseDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(32) version?: string;
  @IsOptional() @IsString() @MaxLength(160) name?: string | null;
  @IsOptional() @IsIn(RELEASE_STATUSES as unknown as string[]) status?: ReleaseStatus;
  @IsOptional() @Matches(DATE_PATTERN) targetDate?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}
