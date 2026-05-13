import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KeycloakAdminService, type KcUser } from './keycloak-admin.service';
import { REALMS, realmById, realmForApp, type RealmDef } from './realms.config';
import { TenantsService } from '../tenants/tenants.service';

export interface RealmSummary {
  id: string;
  label: string;
  apps: string[];
  description: string;
  userCount: number;
  tenantCount: number;
}

export interface DirectoryUser {
  id: string;
  username: string;
  email: string;
  name: string;
  realm: string;
  apps: string[];
  tenantId: string | null;
  tenantName: string | null;
  roles: string[];
  enabled: boolean;
  createdAt: string | null;
}

export interface PaginatedDirectory {
  items: DirectoryUser[];
  total: number;
  limit: number;
  offset: number;
}

export interface DirectoryQuery {
  realm?: string;
  app?: string;
  tenantId?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

interface TenantLike {
  id: string;
  name: string;
}

/**
 * Aggrégat Keycloak → vue HQ.
 *
 *  realm  : domaine d'authentification Keycloak (config statique côté HQ)
 *  app    : application Nola consommatrice du realm (mapping `REALMS`)
 *  tenant : organisation cliente — group Keycloak `/tenants/{tenantId}`
 *  user   : compte utilisateur, appartient au realm, et 0..N groupes tenants
 *
 * Pour rester *agnostique* on n'enrichit pas avec des champs métier
 * (élève / prof / recruteur) — c'est à chaque app, via ses propres
 * roles Keycloak, de qualifier ses utilisateurs. On expose les `roles`
 * bruts pour permettre à l'UI de filtrer si besoin.
 */
@Injectable()
export class DirectoryService {
  private readonly tenantGroupPath: string;

  constructor(
    private readonly kc: KeycloakAdminService,
    private readonly tenants: TenantsService,
    config: ConfigService,
  ) {
    this.tenantGroupPath =
      config.get<string>('KEYCLOAK_TENANT_GROUP_PATH') ?? '/tenants';
  }

  listRealms(): RealmDef[] {
    return REALMS;
  }

  async realmSummaries(): Promise<RealmSummary[]> {
    return Promise.all(
      REALMS.map(async (r) => {
        const [userCount, tenantsInRealm] = await Promise.all([
          this.kc.countUsers(r.id),
          this.tenantsInRealm(r),
        ]);
        return {
          id: r.id,
          label: r.label,
          apps: r.apps,
          description: r.description,
          userCount,
          tenantCount: tenantsInRealm.length,
        };
      }),
    );
  }

  async tenantsInRealm(realm: RealmDef): Promise<TenantLike[]> {
    const all = await this.tenants.list({ limit: 1000 });
    const items = (all as { items: Array<{ id: string; name: string; apps: string[] }> })
      .items ?? [];
    return items
      .filter((t) => t.apps.some((a) => realm.apps.includes(a)))
      .map((t) => ({ id: t.id, name: t.name }));
  }

  async usersInRealm(realmId: string, q: DirectoryQuery = {}): Promise<PaginatedDirectory> {
    const realm = realmById(realmId);
    if (!realm) return empty(q);
    const tenantsByName = await this.tenantsInRealmMap(realm);

    const limit = clamp(q.limit ?? 50, 1, 200);
    const offset = Math.max(0, q.offset ?? 0);
    const search = q.q?.trim() || undefined;

    const [kcUsers, total] = await Promise.all([
      this.kc.listUsers(realm.id, { search, first: offset, max: limit }),
      this.kc.countUsers(realm.id, search),
    ]);

    const items = await Promise.all(
      kcUsers.map((u) => this.adapt(u, realm, tenantsByName, q.tenantId)),
    );
    return {
      items: items.filter((it): it is DirectoryUser => it !== null),
      total,
      limit,
      offset,
    };
  }

  async usersInTenant(tenantId: string, q: DirectoryQuery = {}): Promise<PaginatedDirectory> {
    const tenant = await this.tenants
      .findOne(tenantId)
      .catch(() => null as { id: string; name: string; apps: string[] } | null);
    if (!tenant) return empty(q);

    const realm = tenant.apps.map(realmForApp).find(Boolean);
    if (!realm) return empty(q);

    const limit = clamp(q.limit ?? 50, 1, 200);
    const offset = Math.max(0, q.offset ?? 0);

    const group = await this.kc.groupByPath(realm.id, `${this.tenantGroupPath}/${tenantId}`);
    if (!group) return { items: [], total: 0, limit, offset };

    const members = await this.kc.groupMembers(realm.id, group.id, {
      first: offset,
      max: limit,
    });
    const tenantsByName = new Map<string, string>([[tenantId, tenant.name]]);
    const items = await Promise.all(
      members.map((u) => this.adapt(u, realm, tenantsByName)),
    );
    return {
      items: items.filter((it): it is DirectoryUser => it !== null),
      total: members.length === limit ? offset + members.length + 1 : offset + members.length,
      limit,
      offset,
    };
  }

  async directory(q: DirectoryQuery = {}): Promise<PaginatedDirectory> {
    const limit = clamp(q.limit ?? 50, 1, 200);
    const offset = Math.max(0, q.offset ?? 0);

    if (q.tenantId) return this.usersInTenant(q.tenantId, q);

    const targetRealms = q.realm
      ? REALMS.filter((r) => r.id === q.realm)
      : q.app
      ? REALMS.filter((r) => r.apps.includes(q.app!))
      : REALMS;

    // On collecte la totalité (jusqu'au cap) puis on tranche — paginer
    // proprement sur plusieurs realms nécessiterait un agrégateur stateful,
    // overkill pour la cardinalité actuelle (< 10k users / realm).
    const collected: DirectoryUser[] = [];
    let total = 0;
    for (const r of targetRealms) {
      const tenantsByName = await this.tenantsInRealmMap(r);
      const [users, count] = await Promise.all([
        this.kc.listUsers(r.id, { search: q.q, max: 500 }),
        this.kc.countUsers(r.id, q.q),
      ]);
      total += count;
      for (const u of users) {
        const adapted = await this.adapt(u, r, tenantsByName, q.tenantId);
        if (adapted) collected.push(adapted);
      }
    }

    return {
      items: collected.slice(offset, offset + limit),
      total,
      limit,
      offset,
    };
  }

  private async tenantsInRealmMap(realm: RealmDef): Promise<Map<string, string>> {
    const ts = await this.tenantsInRealm(realm);
    return new Map(ts.map((t) => [t.id, t.name]));
  }

  private async adapt(
    u: KcUser,
    realm: RealmDef,
    tenantsByName: Map<string, string>,
    filterTenantId?: string,
  ): Promise<DirectoryUser | null> {
    const [groups, roles] = await Promise.all([
      this.kc.userGroups(realm.id, u.id),
      this.kc.userRealmRoles(realm.id, u.id),
    ]);

    let tenantId: string | null = null;
    for (const g of groups) {
      const m = g.path.match(/^\/tenants\/([^/]+)/);
      if (m && tenantsByName.has(m[1])) {
        tenantId = m[1];
        break;
      }
    }
    if (filterTenantId && tenantId !== filterTenantId) return null;

    return {
      id: u.id,
      username: u.username ?? '',
      email: u.email ?? '',
      name:
        [u.firstName, u.lastName].filter(Boolean).join(' ') ||
        u.username ||
        u.email ||
        u.id,
      realm: realm.id,
      apps: realm.apps,
      tenantId,
      tenantName: tenantId ? tenantsByName.get(tenantId) ?? null : null,
      roles: roles.map((r) => r.name),
      enabled: u.enabled ?? true,
      createdAt: u.createdTimestamp
        ? new Date(u.createdTimestamp).toISOString()
        : null,
    };
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function empty(q: DirectoryQuery): PaginatedDirectory {
  return {
    items: [],
    total: 0,
    limit: clamp(q.limit ?? 50, 1, 200),
    offset: Math.max(0, q.offset ?? 0),
  };
}
