import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * PATCH /modules/:id — partial override of a feature-module.
 *
 * Every field is optional. `unlock: true` clears the manual-edit lock and
 * removes the override so the app manifest drives the module again (mirrors
 * `plans` `unlock`). At least one field must be provided.
 */
export class UpdateModuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsBoolean()
  default?: boolean;

  @IsOptional()
  @IsBoolean()
  beta?: boolean;

  @IsOptional()
  @IsBoolean()
  unlock?: boolean;
}
