import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from '../../auth/auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { AuthenticatedUser } from './current-user.decorator';

/**
 * Guard global. Lit le cookie chiffré (`nola_hq_session`), le déchiffre via
 * `AuthService.resolveSession`, hydrate `req.user` (forme `AuthenticatedUser`)
 * et `req.tenantId`. Erreurs alignées sur kelasi-backend
 * (`missing_session`, `session_expired`, `session_not_found`).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<
      Request & {
        user?: AuthenticatedUser;
        tenantId?: string;
        cookies?: Record<string, string>;
      }
    >();

    const cookieName = this.authService.cookieName();
    const sessionId =
      req.cookies?.[cookieName] ?? this.bearerToken(req);
    if (!sessionId) {
      throw new UnauthorizedException('missing_session');
    }

    const claims = this.authService.resolveSession(sessionId);
    req.user = {
      sub: claims.sub,
      email: claims.email ?? '',
      realm: claims.realm,
      tenantId: claims.tenant_id,
      roles: claims.roles ?? [],
      impersonator: claims.impersonator
        ? { sub: claims.impersonator.sub, email: '' }
        : undefined,
    };
    req.tenantId = claims.tenant_id;
    return true;
  }

  /**
   * Repli `Authorization: Bearer <session>` pour les clients qui ne savent
   * pas (ou ne veulent pas) gérer les cookies (CLI, scripts d'intégration).
   */
  private bearerToken(req: Request): string | undefined {
    const h = req.headers['authorization'];
    if (typeof h === 'string' && h.startsWith('Bearer ')) {
      return h.slice('Bearer '.length).trim() || undefined;
    }
    return undefined;
  }
}
