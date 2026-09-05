import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { BUSINESS_UNIT_THEMES, type BusinessUnitThemeKey } from '../business-unit.entity';

export class CreateBusinessUnitDto {
  /** Natural key, immutable after creation — baked into `businessUnitCode` on every create path. */
  @IsString()
  @Length(1, 40)
  @Matches(/^[a-z0-9-]+$/, { message: 'code must be lowercase alphanumeric with dashes, e.g. khi-lab' })
  code!: string;

  @IsString()
  @Length(1, 160)
  name!: string;

  /** Resolved server-side, same convention as `businessUnitCode` elsewhere. */
  @IsString()
  legalEntityCode!: string;

  @IsOptional() @IsString() @Length(1, 200) tagline?: string;
  @IsOptional() @IsString() @Length(1, 200) footerLine?: string;
  @IsOptional() @IsIn(BUSINESS_UNIT_THEMES) theme?: BusinessUnitThemeKey;
}
