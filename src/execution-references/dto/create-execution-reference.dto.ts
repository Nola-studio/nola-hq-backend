import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MinLength,
} from 'class-validator';
import {
  EXECUTION_REFERENCE_FORMATS,
  EXECUTION_REFERENCE_ORIGINS,
  type ExecutionReferenceFormat,
  type ExecutionReferenceOrigin,
} from '../execution-reference.entity';

/**
 * Everything a first submission needs: the reference's identity and the
 * content of its first version, in one call. Splitting them would leave a
 * reference with no content, which is never a state worth persisting.
 *
 * `contentHash` is deliberately absent — it is computed server-side, so a
 * sender cannot assert an integrity fingerprint it did not earn.
 */
export class CreateExecutionReferenceDto {
  @ApiProperty({ example: 'REF-NOLAAHQ', description: 'Clé stable, majuscules, chiffres et tirets' })
  @IsString()
  @Length(2, 64)
  @Matches(/^[A-Z0-9][A-Z0-9-]*$/, {
    message: 'key doit être en majuscules (lettres, chiffres, tirets) et commencer par une lettre ou un chiffre',
  })
  key!: string;

  @ApiProperty({ example: "Référentiel d'évolution de Nolaa HQ" })
  @IsString()
  @Length(1, 200)
  title!: string;

  @ApiProperty({ example: '1.3', description: 'Version telle que déclarée par le document' })
  @IsString()
  @Length(1, 32)
  version!: string;

  @ApiProperty({ enum: EXECUTION_REFERENCE_FORMATS })
  @IsIn(EXECUTION_REFERENCE_FORMATS)
  format!: ExecutionReferenceFormat;

  @ApiProperty({ description: 'Le document original, transmis tel quel' })
  @IsString()
  @MinLength(1)
  content!: string;

  @ApiPropertyOptional({ enum: EXECUTION_REFERENCE_ORIGINS, default: 'internal' })
  @IsOptional()
  @IsIn(EXECUTION_REFERENCE_ORIGINS)
  origin?: ExecutionReferenceOrigin;

  @ApiPropertyOptional({ description: 'Email du responsable — par défaut, celui qui dépose' })
  @IsOptional()
  @IsEmail()
  owner?: string;

  @ApiPropertyOptional({ description: 'Domaine fonctionnel concerné' })
  @IsOptional()
  @IsUUID()
  domainId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: 'Initiative ou projet concerné' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ example: '2026-09-04', description: "Date d'effet — distincte de la date de réception" })
  @IsOptional()
  @IsDateString()
  effectiveDate?: string;
}

/** A new revision of an existing reference. Its identity fields never change. */
export class AddExecutionReferenceVersionDto {
  @ApiProperty({ example: '1.4' })
  @IsString()
  @Length(1, 32)
  version!: string;

  @ApiProperty({ enum: EXECUTION_REFERENCE_FORMATS })
  @IsIn(EXECUTION_REFERENCE_FORMATS)
  format!: ExecutionReferenceFormat;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  content!: string;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateString()
  effectiveDate?: string;
}

/** Only the routing fields. Content is immutable; see the entity doc. */
export class UpdateExecutionReferenceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  owner?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  domainId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string | null;
}
