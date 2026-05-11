import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class InviteTeamMemberDto {
  @IsString() name!: string;
  @IsEmail() email!: string;
  @IsString() role!: string;
  @IsOptional() @IsString() tag?: string;
  @IsOptional() @IsString() @Length(2, 2) country?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) perms?: string[];
}
