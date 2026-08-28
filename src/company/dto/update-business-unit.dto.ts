import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { BUSINESS_UNIT_THEMES, type BusinessUnitThemeKey } from '../business-unit.entity';

/** `code` is deliberately absent — immutable once created (see `CreateBusinessUnitDto`). */
export class UpdateBusinessUnitDto {
  @IsOptional() @IsString() @Length(1, 160) name?: string;
  @IsOptional() @IsString() legalEntityCode?: string;
  @IsOptional() @IsString() @Length(1, 200) tagline?: string | null;
  @IsOptional() @IsString() @Length(1, 200) footerLine?: string | null;
  @IsOptional() @IsIn(BUSINESS_UNIT_THEMES) theme?: BusinessUnitThemeKey | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
