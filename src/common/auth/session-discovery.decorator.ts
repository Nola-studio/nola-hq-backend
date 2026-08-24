import { SetMetadata } from '@nestjs/common';

export const IS_SESSION_DISCOVERY_KEY = 'isSessionDiscovery';

/**
 * Use `@SessionDiscovery()` exclusively on identity and session bootstrap routes
 * (specifically `GET /auth/me`) where a caller needs to discover their own identity,
 * roles, and derived capabilities.
 *
 * Distinction vs `@AllowAuthenticated()`:
 * - `@SessionDiscovery()`: Used for **discovering your own role/permissions**. It enables
 *   a newly-authenticated or roleless session to discover that they have no HQ access
 *   and render a clean "unauthorized" page rather than receiving a 403 error on boot.
 * - `@AllowAuthenticated()`: Used for **acting on your own data** (e.g. subscribing your
 *   device to push notifications, or submitting a feature request/ticket) where any
 *   authenticated user is legitimately permitted to execute the operation regardless
 *   of role.
 */
export const SessionDiscovery = () => SetMetadata(IS_SESSION_DISCOVERY_KEY, true);
