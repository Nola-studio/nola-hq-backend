import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { HqRole, hasHqRole } from './hq-role.enum';
import { HQ_ROLES_KEY } from './hq-roles.decorator';
import type { AuthenticatedUser } from './current-user.decorator';

/**
 * Enforces `@HqRoles(...)` metadata on routes. Run *after* `JwtAuthGuard`
 * so `req.user` is already hydrated. Endpoints without the decorator are
 * left untouched — they only need authentication.
 *
 * To make this active, register it as a global guard in `app.module.ts`
 * AFTER the JwtAuthGuard provider. Both must point at the same instance
 * via `useExisting` so they share the request context.
 */
@Injectable()
export class HqRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<HqRole[] | undefined>(
      HQ_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const userRoles = req.user?.roles ?? [];

    // Multiple roles in the decorator means "satisfies ANY of them".
    // Each one is checked with the hierarchical helper, so owner passes
    // an `@HqRoles(HqRole.Operator)` requirement automatically.
    const ok = required.some((r) => hasHqRole(userRoles, r));
    if (!ok) {
      throw new ForbiddenException({
        code: 'insufficient_hq_role',
        required,
        held: userRoles.filter((r) => r.startsWith('hq:')),
      });
    }
    return true;
  }
}
