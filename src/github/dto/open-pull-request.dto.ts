import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class OpenPullRequestDto {
  /**
   * Sur quelle branche ouvrir. Facultatif quand le ticket n'en a qu'une
   * ouverte — ne pas poser une question dont la réponse est unique. Avec
   * plusieurs, le service refuse plutôt que de choisir : une pull request
   * s'ouvre sur un travail précis.
   */
  @IsOptional() @IsUUID() branchId?: string;

  /** Une PR en brouillon demande une relecture sans la réclamer. */
  @IsOptional() @IsBoolean() @Type(() => Boolean) draft?: boolean;
}
