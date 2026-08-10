import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import type { HqAccessLevel } from './invite-team-member.dto';

export class UpdateTeamMemberDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() tag?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(2, 2) country?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) perms?: string[];
  @IsOptional() @IsBoolean() online?: boolean;
  /** Changing this re-syncs the `hq:*` Keycloak realm role — see `TeamService.update()`. */
  @IsOptional() @IsIn(['viewer', 'operator', 'owner']) hqAccess?: HqAccessLevel;
  /** Where ticket notifications actually go — null clears it back to `email`. */
  @IsOptional() @IsEmail() notifyEmail?: string | null;
}
