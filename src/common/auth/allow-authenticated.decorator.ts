import { SetMetadata } from '@nestjs/common';

export const ALLOW_AUTHENTICATED_KEY = 'allowAuthenticated';

/**
 * Declares that an endpoint requires a valid authenticated session
 * (enforced by JwtAuthGuard), but does not require any specific hq:* role.
 * Any authenticated user (regardless of role) may invoke it.
 */
export const AllowAuthenticated = () => SetMetadata(ALLOW_AUTHENTICATED_KEY, true);
