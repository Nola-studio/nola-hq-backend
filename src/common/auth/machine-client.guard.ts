import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NolaAuthService } from '@nola-hq/nola-sdk';
import { API_SCOPES_KEY } from './api-scopes.decorator';
import { hasScopes, type ApiScope } from './api-scope';

/** What a verified machine client is, once the guard has run. */
export interface MachineClient {
  /** Keycloak service-account subject — the integration's stable identity. */
  clientId: string;
  scopes: string[];
  realm: string;
}

/**
 * Guards the public machine-to-machine surface (EXE-02).
 *
 * A machine client presents a **Keycloak client-credentials token**, and HQ
 * verifies it against the realm's JWKS — the same `verifyToken` the console
 * login uses. HQ issues nothing and stores no credential: revoking an
 * integration happens in Nola Auth, where it was granted.
 *
 * This is deliberately not the global `JwtAuthGuard`. That one reads the
 * console's encrypted session cookie, and treats `Authorization: Bearer …` as
 * a *session id* — handing it a real JWT would fail in a confusing way. The
 * two authentication stories stay apart because they are apart: a browser
 * with a session, and a service with a token.
 *
 * Public routes therefore carry `@Public()` to step past the session guard,
 * and this guard to be let in on their own terms. Without it a route marked
 * `@Public()` would be genuinely public, so **every public-API route must
 * declare both** — the controller applies this guard at class level so no
 * individual route can forget.
 */
@Injectable()
export class MachineClientGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly nolaAuth: NolaAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      machineClient?: MachineClient;
    }>();

    const token = bearerToken(req.headers.authorization);
    if (!token) {
      throw new UnauthorizedException(
        'missing_bearer_token: présentez un jeton client_credentials émis par Nola Auth.',
      );
    }

    let claims;
    try {
      claims = await this.nolaAuth.verifyToken(token);
    } catch {
      // Deliberately opaque: a caller learns that the token was refused, not
      // which check refused it.
      throw new UnauthorizedException('invalid_token');
    }

    const scopes = claims.roles ?? [];
    req.machineClient = { clientId: claims.sub, scopes, realm: claims.realm };

    const required = this.reflector.getAllAndOverride<ApiScope[]>(API_SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    if (!hasScopes(scopes, required)) {
      throw new ForbiddenException(
        `insufficient_scope: ${required.join(', ')} requis.`,
      );
    }
    return true;
  }
}

function bearerToken(header: string | string[] | undefined): string | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  const [scheme, value] = raw.split(' ');
  if (!value || scheme.toLowerCase() !== 'bearer') return null;
  return value.trim() || null;
}
