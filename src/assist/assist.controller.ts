import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { AssistService } from './assist.service';
import { HqRoles } from '../common/auth/hq-roles.decorator';
import { HqRole, hasHqRole } from '../common/auth/hq-role.enum';
import { Public } from '../common/auth/public.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator';

class StartAssistDto {
  @IsString() app!: string;
  @IsIn(['read', 'write']) mode!: 'read' | 'write';
  @IsString() @MinLength(3) reason!: string;
  @IsOptional() @IsString() targetEmail?: string;
}

class RedeemDto {
  @IsString() code!: string;
}

@ApiBearerAuth()
@ApiTags('assist')
@Controller()
export class AssistController {
  constructor(private readonly svc: AssistService) {}

  /**
   * Start an assisted-access session for a tenant. Operator may start a
   * read-only session; **write mode requires Owner**. Returns a deeplink the
   * operator opens — the impersonated token never reaches this browser.
   */
  @Post('tenants/:id/impersonate')
  @HqRoles(HqRole.Operator)
  async start(
    @Param('id') tenantId: string,
    @Body() dto: StartAssistDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (dto.mode === 'write' && !hasHqRole(user.roles ?? [], HqRole.Owner)) {
      throw new ForbiddenException('write_impersonation_requires_owner');
    }
    return this.svc.start({
      tenantId,
      app: dto.app,
      mode: dto.mode,
      reason: dto.reason,
      targetEmail: dto.targetEmail,
      actor: user.email ?? user.sub,
      actorName: (user as { name?: string }).name,
    });
  }

  /**
   * Back-channel redemption — called by the target app's gateway (not a
   * browser) with the shared secret. One-time: the code is consumed.
   */
  @Public()
  @Post('assist/redeem')
  redeem(@Body() dto: RedeemDto, @Headers('x-assist-secret') secret?: string) {
    const expected = this.svc.redeemSecret();
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('invalid_assist_secret');
    }
    return this.svc.redeem(dto.code);
  }
}
