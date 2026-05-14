import { SetMetadata } from '@nestjs/common';
import { HqRole } from './hq-role.enum';

export const HQ_ROLES_KEY = 'hqRoles';

/**
 * Annotate a controller or handler with the minimum HQ role required
 * to execute it. Pass multiple roles to accept any of them (rarely
 * useful — the hierarchy in `hasHqRole` usually does what you want).
 *
 *   @HqRoles(HqRole.Operator)   ← operators + owners pass
 *   @HqRoles(HqRole.Owner)      ← only owners pass
 *
 * Reads (GET) generally stay open to any authenticated user. Apply
 * this decorator on mutating routes (PATCH/POST/DELETE) and on any
 * read that exposes secrets (impersonation tokens, raw audit logs, …).
 */
export const HqRoles = (...roles: HqRole[]) => SetMetadata(HQ_ROLES_KEY, roles);
