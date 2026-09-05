import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { BRANCH_PREFIXES, type BranchPrefix } from '../branch-name';

export class StartWorkDto {
  /**
   * Le dépôt cible. Facultatif quand le projet n'en a qu'un seul autorisé —
   * ne pas poser une question dont la réponse est unique.
   */
  @IsOptional() @IsUUID() repositoryId?: string;

  /** Par défaut la branche par défaut du dépôt, telle que GitHub la déclare. */
  @IsOptional() @IsString() @MaxLength(255) baseBranch?: string;

  /** Le seul chemin vers `hotfix`, qui ne se déduit d'aucun type. */
  @IsOptional() @IsIn(BRANCH_PREFIXES as unknown as string[]) prefix?: BranchPrefix;
}
