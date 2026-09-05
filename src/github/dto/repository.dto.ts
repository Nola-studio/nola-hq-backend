import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import {
  REPOSITORY_SIDES,
  REPOSITORY_VISIBILITIES,
  type RepositorySide,
  type RepositoryVisibility,
} from '../repository.entity';

export class RegisterRepositoryDto {
  /**
   * `owner/name`, une URL HTTPS ou SSH — voir `repository-slug.ts`. Un seul
   * champ plutôt que deux : personne ne retape un dépôt, on le colle.
   */
  @IsString() @MinLength(3) @MaxLength(400)
  ref!: string;

  @IsOptional() @IsString() @MaxLength(255) defaultBranch?: string;
  @IsOptional() @IsIn(REPOSITORY_VISIBILITIES as unknown as string[]) visibility?: RepositoryVisibility;
  @IsOptional() @IsString() @MaxLength(400) htmlUrl?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsOptional() @IsUUID() productId?: string | null;
  @IsOptional() @IsUUID() domainId?: string | null;
  @IsOptional() @IsString() @MaxLength(160) steward?: string | null;
  @IsOptional() @IsIn(REPOSITORY_SIDES as unknown as string[]) side?: RepositorySide | null;
  @IsOptional() @IsString() @MaxLength(64) externalId?: string | null;
}

/**
 * `ref` est absent : renommer un dépôt dans HQ ne le renomme pas sur GitHub.
 * Un vrai renommage viendra de la synchronisation, rapproché par
 * `externalId`.
 */
export class UpdateRepositoryDto {
  @IsOptional() @IsString() @MaxLength(255) defaultBranch?: string;
  @IsOptional() @IsIn(REPOSITORY_VISIBILITIES as unknown as string[]) visibility?: RepositoryVisibility;
  @IsOptional() @IsString() @MaxLength(400) htmlUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsOptional() @IsUUID() productId?: string | null;
  @IsOptional() @IsUUID() domainId?: string | null;
  @IsOptional() @IsString() @MaxLength(160) steward?: string | null;
  /** Backend, frontend ou les deux — ce qui permet à « Start Work » de choisir. */
  @IsOptional() @IsIn(REPOSITORY_SIDES as unknown as string[]) side?: RepositorySide | null;
  @IsOptional() @IsBoolean() @Type(() => Boolean) archived?: boolean;
}

export class ListRepositoriesDto {
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() domainId?: string;
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  /** Les archivés sont exclus par défaut : ils ne sont plus proposés. */
  @IsOptional() @IsBoolean() @Type(() => Boolean) includeArchived?: boolean;
}

export class LinkProjectDto {
  @IsUUID() projectId!: string;
}
