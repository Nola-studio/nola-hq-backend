import { SetMetadata } from '@nestjs/common';

export const ALLOW_AUTHENTICATED_KEY = 'allowAuthenticated';

/**
 * Use `@AllowAuthenticated()` on functional endpoints where any authenticated caller
 * is allowed to execute an operation or act on their own data, without requiring a
 * specific `hq:*` role (e.g. `hq:viewer`, `hq:operator`, `hq:owner`).
 *
 * Examples:
 * - `PushController` (`/notifications/push/*`): Subscribing/unsubscribing a user's own device.
 * - `StudioRequestsController` (`POST /studio/requests`): Filing a bug or feature request.
 *
 * Distinction vs `@SessionDiscovery()`:
 * - `@AllowAuthenticated()`: Used for **acting on your own data** or self-service features.
 * - `@SessionDiscovery()`: Used exclusively for **discovering your own role/permissions**
 *   on session bootstrap (`GET /auth/me`).
 */
export const AllowAuthenticated = () => SetMetadata(ALLOW_AUTHENTICATED_KEY, true);
