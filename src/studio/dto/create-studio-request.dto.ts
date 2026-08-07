import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import {
  STUDIO_REQUEST_PRIORITIES,
  STUDIO_REQUEST_TYPES,
  type StudioRequestPriority,
  type StudioRequestType,
} from '../studio-request.entity';

/**
 * POST /studio/requests — open to any authenticated user (no `@HqRoles`),
 * unlike every other mutating Studio endpoint. `author` is taken from the
 * JWT (`CurrentUser`), never from the body. `status` always starts at
 * `nouvelle` — only `PATCH .../status` can move it.
 */
export class CreateStudioRequestDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsIn(STUDIO_REQUEST_TYPES as unknown as string[]) type!: StudioRequestType;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsEmail() @MaxLength(160) assigneeEmail?: string;
  @IsOptional() @IsIn(STUDIO_REQUEST_PRIORITIES as unknown as string[]) priority?: StudioRequestPriority;
}
