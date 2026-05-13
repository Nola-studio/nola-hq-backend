import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface KcUser {
  id: string;
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  createdTimestamp?: number;
  attributes?: Record<string, string[]>;
}

export interface KcGroup {
  id: string;
  name: string;
  path: string;
  subGroups?: KcGroup[];
}

export interface KcSearchParams {
  search?: string;
  first?: number;
  max?: number;
  enabled?: boolean;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * Client minimal de l'API admin Keycloak.
 *
 * Authentification : `client_credentials` grant sur le realm `master`
 * (ou un realm dédié) avec un client confidentiel possédant le rôle
 * `realm-management/view-users` (ou `realm-admin`) sur chaque realm
 * cible.
 *
 * Mode dégradé : si `KEYCLOAK_ADMIN_*` n'est pas configuré, toutes les
 * méthodes renvoient des listes vides + warn. Permet à la console de
 * tourner offline (dev local sans Keycloak) sans crash.
 *
 * Endpoints utilisés (référence Keycloak Admin REST API) :
 *  - `GET /admin/realms/{realm}/users`
 *  - `GET /admin/realms/{realm}/users/count`
 *  - `GET /admin/realms/{realm}/groups`
 *  - `GET /admin/realms/{realm}/groups/{id}/members`
 *  - `GET /admin/realms/{realm}/group-by-path/{path}`
 */
@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);
  private cached: CachedToken | null = null;

  constructor(private readonly config: ConfigService) {}

  private baseUrl(): string | null {
    return (
      this.config.get<string>('KEYCLOAK_ADMIN_BASE_URL') ??
      this.config.get<string>('KEYCLOAK_BASE_URL') ??
      null
    );
  }

  private authRealm(): string {
    return this.config.get<string>('KEYCLOAK_ADMIN_REALM') ?? 'master';
  }

  isConfigured(): boolean {
    return Boolean(
      this.baseUrl() &&
        this.config.get<string>('KEYCLOAK_ADMIN_CLIENT_ID') &&
        this.config.get<string>('KEYCLOAK_ADMIN_CLIENT_SECRET'),
    );
  }

  private async token(): Promise<string | null> {
    if (!this.isConfigured()) return null;
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now + 5_000) {
      return this.cached.accessToken;
    }
    const base = this.baseUrl()!.replace(/\/$/, '');
    const url = `${base}/realms/${this.authRealm()}/protocol/openid-connect/token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.get<string>('KEYCLOAK_ADMIN_CLIENT_ID')!,
      client_secret: this.config.get<string>('KEYCLOAK_ADMIN_CLIENT_SECRET')!,
    });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      this.logger.warn(`Keycloak admin token failed (status=${res.status})`);
      return null;
    }
    const json = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.cached = {
      accessToken: json.access_token,
      expiresAt: now + json.expires_in * 1000,
    };
    return json.access_token;
  }

  private async adminGet<T>(realm: string, path: string, qs?: URLSearchParams): Promise<T | null> {
    const token = await this.token();
    if (!token) return null;
    const base = this.baseUrl()!.replace(/\/$/, '');
    const url = `${base}/admin/realms/${realm}${path}${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      this.logger.warn(`Keycloak admin GET ${url} failed (status=${res.status})`);
      return null;
    }
    return (await res.json()) as T;
  }

  async listUsers(realm: string, params: KcSearchParams = {}): Promise<KcUser[]> {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.first != null) qs.set('first', String(params.first));
    if (params.max != null) qs.set('max', String(params.max));
    if (params.enabled != null) qs.set('enabled', String(params.enabled));
    return (await this.adminGet<KcUser[]>(realm, '/users', qs)) ?? [];
  }

  async countUsers(realm: string, search?: string): Promise<number> {
    const qs = new URLSearchParams();
    if (search) qs.set('search', search);
    const res = await this.adminGet<number>(realm, '/users/count', qs);
    return res ?? 0;
  }

  async groupByPath(realm: string, path: string): Promise<KcGroup | null> {
    const encoded = path
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/');
    return this.adminGet<KcGroup>(realm, `/group-by-path/${encoded}`);
  }

  async groupMembers(
    realm: string,
    groupId: string,
    params: { first?: number; max?: number } = {},
  ): Promise<KcUser[]> {
    const qs = new URLSearchParams();
    if (params.first != null) qs.set('first', String(params.first));
    if (params.max != null) qs.set('max', String(params.max));
    return (await this.adminGet<KcUser[]>(realm, `/groups/${groupId}/members`, qs)) ?? [];
  }

  async userGroups(realm: string, userId: string): Promise<KcGroup[]> {
    return (await this.adminGet<KcGroup[]>(realm, `/users/${userId}/groups`)) ?? [];
  }

  async userRealmRoles(realm: string, userId: string): Promise<{ name: string }[]> {
    return (
      (await this.adminGet<{ name: string }[]>(
        realm,
        `/users/${userId}/role-mappings/realm`,
      )) ?? []
    );
  }
}
