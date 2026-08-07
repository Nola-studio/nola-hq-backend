import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import {
  STUDIO_REQUEST_PRIORITIES,
  STUDIO_REQUEST_TYPES,
  type StudioRequestPriority,
  type StudioRequestType,
} from '../studio-request.entity';

/**
 * PATCH /studio/requests/:id — everything but `status` (see
 * `UpdateStudioRequestStatusDto`, gated separately at `hq:operator`).
 * `null` clears a nullable field; omitting a key leaves it untouched.
 */
export class UpdateStudioRequestDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsIn(STUDIO_REQUEST_TYPES as unknown as string[]) type?: StudioRequestType;
  @IsOptional() @IsUUID() projectId?: string | null;
  @IsOptional() @IsEmail() @MaxLength(160) assigneeEmail?: string | null;
  @IsOptional() @IsIn(STUDIO_REQUEST_PRIORITIES as unknown as string[]) priority?: StudioRequestPriority;
}
