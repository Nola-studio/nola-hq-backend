import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { HEX_COLOR_PATTERN } from './create-project.dto';

/**
 * PATCH /studio/projects/:id — everything but `key` (immutable — see
 * `CreateProjectDto`) and `status` (toggled via the dedicated
 * archive/unarchive endpoints, not a free-form field here).
 */
export class UpdateProjectDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsOptional() @IsString() @Matches(HEX_COLOR_PATTERN, { message: 'La couleur doit être un hex #RRGGBB.' }) color?: string;
  @IsOptional() @IsEmail() @MaxLength(120) ownerEmail?: string | null;
}
