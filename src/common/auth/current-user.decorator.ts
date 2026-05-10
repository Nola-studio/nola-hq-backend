import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Forme exposée aux contrôleurs après passage du `JwtAuthGuard`. Identique
 * à `AuthenticatedUser` de `@kelasi/common` — un même client HTTP peut donc
 * réutiliser ses types entre Kelasi et le HQ.
 */
export interface AuthenticatedUser {
  sub: string;
  email: string;
  realm: string;
  tenantId: string;
  roles: string[];
  /** Présent en cas d'impersonation (RFC 8693, claim `act`). */
  impersonator?: { sub: string; email: string };
}

/** Type rétro-compatible pour les contrôleurs existants. */
export type CurrentUserPayload = AuthenticatedUser;

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    return req.user;
  },
);
