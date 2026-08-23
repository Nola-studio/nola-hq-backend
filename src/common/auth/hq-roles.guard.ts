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
import { IS_PUBLIC_KEY } from './public.decorator';
import type { AuthenticatedUser } from './current-user.decorator';

/**
 * Enforces `@HqRoles(...)` metadata on routes. Run *after* `JwtAuthGuard`
 * so `req.user` is already hydrated.
 *
 * Fail-closed policy:
 * - Endpoints marked `@Public()` are allowed through.
 * - Endpoints declaring `@HqRoles(...)` require the caller's session to satisfy
 *   the minimum required role (hierarchical check).
 * - Endpoints with NO `@HqRoles` metadata fail closed with 403 (`missing_hq_roles_guard`).
 */
@Injectable()
export class HqRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<HqRole[] | undefined>(
      HQ_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      throw new ForbiddenException({
        code: 'missing_hq_roles_guard',
        message: 'Endpoint is not marked with @HqRoles or @Public',
      });
    }

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

