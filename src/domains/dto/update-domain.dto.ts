import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsInt, IsOptional, Min } from 'class-validator';

/**
 * Only the mutable fields.
 *
 * `code` is the stable key that manifests, URLs and every `domain_id` point
 * at, so it is never patchable. `name` and `purpose` come from the referential
 * — changing them means publishing a new referential version and re-seeding,
 * not editing a row behind the document's back.
 */
export class UpdateDomainDto {
  @ApiPropertyOptional({ description: 'Email du propriétaire du domaine (§14.2)' })
  @IsOptional()
  @IsEmail()
  owner?: string | null;

  @ApiPropertyOptional({ description: "Ordre d'affichage — n'affecte jamais le code" })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

/** Same rules, one level down. */
export class UpdateCapabilityDto {
  @ApiPropertyOptional({ description: 'Email du propriétaire de la capacité' })
  @IsOptional()
  @IsEmail()
  owner?: string | null;

  @ApiPropertyOptional({ description: "Ordre d'affichage au sein du domaine" })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
