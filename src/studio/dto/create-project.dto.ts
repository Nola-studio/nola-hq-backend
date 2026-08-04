import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * POST /studio/projects — `key` becomes the prefix of every task
 * `identifier` in this project (`YEK-1`, `YEK-2`, …), so it's restricted to
 * the same shape as the seeded defaults: uppercase letters/digits, starting
 * with a letter. `StudioTasksService.create` splits `identifier` on
 * `key.length`, so no separator characters are allowed in the key itself.
 */
export class CreateProjectDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(/^[A-Z][A-Z0-9]{1,9}$/, {
    message: 'Le code doit faire 2 à 10 caractères alphanumériques (majuscules), et commencer par une lettre.',
  })
  key!: string;

  @IsString() @MinLength(1) @MaxLength(120) name!: string;
}
