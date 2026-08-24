import { SetMetadata } from '@nestjs/common';

export const IS_SESSION_DISCOVERY_KEY = 'isSessionDiscovery';

/**
 * Marks an endpoint (specifically GET /auth/me) as the session identity
 * and capability discovery route. Requires a valid authenticated session
 * but bypasses HqRoles checks so roleless users can discover their access.
 */
export const SessionDiscovery = () => SetMetadata(IS_SESSION_DISCOVERY_KEY, true);
