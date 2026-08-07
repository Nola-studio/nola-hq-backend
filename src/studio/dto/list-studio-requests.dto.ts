import { IsEmail, IsIn, IsOptional, IsUUID } from 'class-validator';
import {
  STUDIO_REQUEST_PRIORITIES,
  STUDIO_REQUEST_STATUSES,
  STUDIO_REQUEST_TYPES,
  type StudioRequestPriority,
  type StudioRequestStatus,
  type StudioRequestType,
} from '../studio-request.entity';

export class ListStudioRequestsDto {
  @IsOptional() @IsIn(STUDIO_REQUEST_TYPES as unknown as string[]) type?: StudioRequestType;
  @IsOptional() @IsIn(STUDIO_REQUEST_STATUSES as unknown as string[]) status?: StudioRequestStatus;
  @IsOptional() @IsIn(STUDIO_REQUEST_PRIORITIES as unknown as string[]) priority?: StudioRequestPriority;
  @IsOptional() @IsUUID() project?: string;
  @IsOptional() @IsEmail() assignee?: string;
  @IsOptional() @IsEmail() author?: string;
}
