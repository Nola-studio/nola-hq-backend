import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CookieConfigService } from './cookie-config';
import { LoginDto } from './dto/login.dto';
import { Public } from '../common/auth/public.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../common/auth/current-user.decorator';
import { HqRole, hasHqRole } from '../common/auth/hq-role.enum';

/**
 * Project the user's raw role strings into a frontend-friendly access
 * descriptor. Centralised here so the UI doesn't have to mirror the
 * role names (or the hierarchy) — it just reads `hq.canEdit` etc.
 */
function deriveHqAccess(roles: string[]): {
  role: 'owner' | 'operator' | 'viewer' | null;
  canRead: boolean;
  canEdit: boolean;
  canAdminister: boolean;
} {
  const isOwner = hasHqRole(roles, HqRole.Owner);
  const isOperator = isOwner || hasHqRole(roles, HqRole.Operator);
  const isViewer = isOperator || hasHqRole(roles, HqRole.Viewer);
  return {
    role: isOwner ? 'owner' : isOperator ? 'operator' : isViewer ? 'viewer' : null,
    canRead: isViewer,
    canEdit: isOperator,
    canAdminister: isOwner,
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: CookieConfigService,
  ) {}

  @Public()
  // Tight cap on login to blunt credential brute-force: 10 attempts/min/IP.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login({
      email: dto.email,
      password: dto.password,
      ipAddress: this.clientIp(req),
      userAgent: req.headers['user-agent'],
    });

    const cookie = this.cookies.cookie();
    res.cookie(cookie.name, result.sessionId, {
      httpOnly: true,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
      domain: cookie.domain,
      maxAge: result.expiresIn * 1000,
      path: '/',
    });

    return {
      // Forme alignée sur kelasi-backend (cookie est la source de vérité).
      // On expose aussi `sessionId` pour les clients sans cookies (scripts /
      // CLI / explorations Swagger).
      sessionId: result.sessionId,
      user: {
        sub: result.user.sub,
        tenant_id: result.user.tenant_id,
        realm: result.user.realm,
        email: result.user.email,
        name: result.user.name,
        roles: result.user.roles,
        plan: result.user.plan,
      },
    };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): void {
    const sessionId = this.readCookie(req);
    if (sessionId) this.auth.logout(sessionId);
    const cookie = this.cookies.cookie();
    res.clearCookie(this.auth.cookieName(), {
      path: '/',
      domain: cookie.domain,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
    });
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser | undefined) {
    if (!user) throw new UnauthorizedException('not_authenticated');
    const profile = await this.auth.profile(user.sub, user.email);
    return { ...user, profile, hq: deriveHqAccess(user.roles) };
  }

  private readCookie(req: Request): string | undefined {
    const name = this.auth.cookieName();
    const cookies = (req as Request & { cookies?: Record<string, string> })
      .cookies;
    return cookies?.[name];
  }

  private clientIp(req: Request): string {
    const fwd = req.headers['x-forwarded-for'];
    if (Array.isArray(fwd)) return fwd[0]!;
    if (typeof fwd === 'string') return fwd.split(',')[0]!.trim();
    return req.socket.remoteAddress ?? '0.0.0.0';
  }
}
