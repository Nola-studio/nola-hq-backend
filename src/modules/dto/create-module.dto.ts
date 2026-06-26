import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * POST /modules — register a feature-module override.
 *
 * Use to create a **custom** module (no manifest counterpart) or to seed an
 * override for a module the manifest already declares. `id` (alias `key`) is
 * the module identifier within the app; the synthetic addressable id becomes
 * `"<app>:<id>"`.
 */
export class CreateModuleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  app!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  id?: string;

  /** Alias for `id` — the frontend may send either. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  key?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @IsOptional()
  @IsBoolean()
  default?: boolean;

  @IsOptional()
  @IsBoolean()
  beta?: boolean;
}
