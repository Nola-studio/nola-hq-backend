import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import type { NolaJwtPayload } from '@nola-studio/sdk';
import { NOLA_CONFIG, type NolaConfig } from '../nola.config';
import { NolaClientService } from '../nola-client.service';

export interface SilentLoginRequest {
  email: string;
  password: string;
  ipAddress: string;
  deviceFingerprint?: string;
}

export interface SilentLoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Silent SSO + JWT verification for Nola apps.
 *
 * Per the contract confirmed with the nola-auth team:
 * - The bootstrap returns `{bffClientId, bffClientSecret, authIssuer}` where
 *   authIssuer is the OIDC issuer of the realm the app lives in (Keycloak).
 * - Apps perform silent SSO with a standard OIDC password grant on
 *   `${authIssuer}/protocol/openid-connect/token` using the BFF client creds.
 * - Tokens are verified against the realm's JWKS at
 *   `${authIssuer}/protocol/openid-connect/certs` (Keycloak does NOT expose
 *   `.well-known/jwks.json`, which is why the SDK's AuthClient is bypassed
 *   here).
 */
@Injectable()
export class NolaAuthService implements OnModuleInit {
  private readonly logger = new Logger(NolaAuthService.name);
  private jwks: JWTVerifyGetKey | null = null;
  private jwksIssuer: string | null = null;

  constructor(
    @Inject(NOLA_CONFIG) private readonly config: NolaConfig,
    private readonly nolaClient: NolaClientService,
  ) {}

  onModuleInit(): void {
    const issuer = this.resolveIssuer();
    if (!issuer) {
      this.logger.warn(
        'No auth issuer available — JWT verification disabled until NolaClient registers',
      );
      return;
    }
    this.bindJwks(issuer);
  }

  async verifyToken(token: string): Promise<NolaJwtPayload> {
    const issuer = this.resolveIssuer();
    if (!issuer) {
      throw new Error('Auth issuer unavailable — cannot verify tokens');
    }
    if (!this.jwks || this.jwksIssuer !== issuer) {
      this.bindJwks(issuer);
    }
    const { payload } = await jwtVerify(token, this.jwks!, { issuer });
    return this.mapKeycloakPayload(payload);
  }

  hasRole(payload: NolaJwtPayload, role: string): boolean {
    return payload.roles.includes(role);
  }

  isImpersonated(payload: NolaJwtPayload): boolean {
    return Boolean(payload.impersonator);
  }

  /**
   * OIDC password grant against the realm's token endpoint, using the BFF
   * client credentials returned by bootstrap. Returns the Keycloak-issued
   * tokens directly — no nola-auth wrapper involved (the wrapper endpoint
   * is HMAC-only and reserved for Nola-internal services like nola-studio).
   */
  async silentLogin(req: SilentLoginRequest): Promise<SilentLoginResponse> {
    await this.nolaClient.ready();
    const reg = this.nolaClient.getRegistration();
    if (!reg?.bffClientId || !reg?.bffClientSecret || !reg?.authIssuer) {
      throw new Error('BFF client credentials missing (registration incomplete)');
    }

    const tokenUrl = `${reg.authIssuer.replace(/\/$/, '')}/protocol/openid-connect/token`;
    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: reg.bffClientId,
      client_secret: reg.bffClientSecret,
      username: req.email,
      password: req.password,
      scope: 'openid',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Forwarded-For': req.ipAddress,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new SilentLoginError(response.status, text);
    }
    const json = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresIn: json.expires_in,
    };
  }

  private bindJwks(issuer: string): void {
    const certsUrl = `${issuer.replace(/\/$/, '')}/protocol/openid-connect/certs`;
    this.jwks = createRemoteJWKSet(new URL(certsUrl));
    this.jwksIssuer = issuer;
    this.logger.log(`JWT verification ready (issuer=${issuer}, jwks=${certsUrl})`);
  }

  /**
   * Maps the raw Keycloak realm payload onto the NolaJwtPayload shape.
   * Keycloak emits `realm_access.roles`, while NolaJwtPayload expects
   * top-level `roles`. The plan/apps_actives/modules_actifs claims would
   * normally be enriched by a Keycloak protocol mapper that reads from
   * nola-billing — until that wiring is in place we stub them so the
   * downstream code (JwtAuthGuard, controllers) can operate.
   */
  private mapKeycloakPayload(payload: JWTPayload): NolaJwtPayload {
    const realmAccess = (payload as { realm_access?: { roles?: string[] } })
      .realm_access;
    return {
      sub: String(payload.sub ?? ''),
      realm: this.config.bootstrap?.realm ?? 'kelasi',
      tenant_id: String((payload as { tenant_id?: string }).tenant_id ?? ''),
      apps_actives: ['kelasi'],
      modules_actifs: [],
      plan: 'starter',
      roles: realmAccess?.roles ?? [],
      email: (payload as { email?: string }).email,
      name: (payload as { name?: string }).name,
    };
  }

  private resolveIssuer(): string | undefined {
    return (
      this.config.authIssuer ??
      this.nolaClient.getRegistration()?.authIssuer ??
      undefined
    );
  }
}

export class SilentLoginError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`silent_login_failed (status=${status})`);
  }
}
