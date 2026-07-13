import {
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export type HqAccessLevel = 'viewer' | 'operator' | 'owner';

export class InviteTeamMemberDto {
  @IsString() name!: string;
  @IsEmail() email!: string;
  @IsString() role!: string;
  @IsOptional() @IsString() tag?: string;
  @IsOptional() @IsString() @Length(2, 2) country?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) perms?: string[];
  /**
   * HQ console access level → mapped to the Keycloak realm role
   * (`hq:viewer|operator|owner`) at auto-provision. Defaults to the least
   * privilege (`viewer`) when omitted.
   */
  @IsOptional() @IsIn(['viewer', 'operator', 'owner']) hqAccess?: HqAccessLevel;
}
