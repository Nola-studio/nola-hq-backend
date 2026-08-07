import { IsArray, IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { DATE_PATTERN } from './create-task.dto';

export class UpdateMeetingDto {
  @IsOptional() @Matches(DATE_PATTERN) date?: string;
  @IsOptional() @IsString() @MinLength(1) title?: string;
  @IsOptional() @IsArray() @IsEmail({}, { each: true }) participants?: string[];
  @IsOptional() @IsString() agenda?: string;
  @IsOptional() @IsString() decisions?: string;
}
