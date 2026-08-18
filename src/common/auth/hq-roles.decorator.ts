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
 * Most reads (GET) stay open to any authenticated user — apply this
 * decorator on mutating routes (PATCH/POST/DELETE) by default. Two
 * exceptions require it on GETs too: routes that expose secrets
 * (impersonation tokens, raw audit logs, …), and routes that expose
 * cross-tenant aggregates (MRR, invoice totals, tenant rosters — see
 * AnalyticsController, and the gated routes in AppsController,
 * HealthController, InvoicesController, SubscriptionsController).
 */
export const HqRoles = (...roles: HqRole[]) => SetMetadata(HQ_ROLES_KEY, roles);
