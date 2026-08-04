import { IsArray, IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { DATE_PATTERN } from './create-task.dto';

export class CreateMeetingDto {
  @Matches(DATE_PATTERN) date!: string;
  @IsString() @MinLength(1) title!: string;
  /** Team members' emails — soft reference (`team_members.email`). */
  @IsOptional() @IsArray() @IsEmail({}, { each: true }) participants?: string[];
  @IsOptional() @IsString() agenda?: string;
  @IsOptional() @IsString() decisions?: string;
}
