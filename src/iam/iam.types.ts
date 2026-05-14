/**
 * Shape contracts mirroring nola-iam's exported DTOs — kept in sync with
 * `nola-platform/services/nola-auth/src/{persons,orgs,memberships}/dto/`.
 *
 * HQ-specific note: the `list_all` admin commands respond with a
 * `{ items, total }` envelope around the per-entity shape — the per-tenant
 * commands (used by kelasi etc.) return bare arrays. Keep both shapes typed
 * so the gateway client can pick the right unwrap.
 */

export type PlatformRole = 'owner' | 'admin' | 'member' | 'guest';

// ─── Persons ────────────────────────────────────────────────────

export interface IamPersonResponse {
  id: string;
  primaryEmail: string;
  emailVerified: boolean;
  displayName?: string | null;
  phone?: string | null;
  status: string;
  createdAt: string;
}

export interface IamUpsertPersonResponse extends IamPersonResponse {
  outcome: 'created' | 'linked' | 'existing';
  realm: string;
  kcSub: string;
}

export interface IamPersonAdminRow extends IamUpsertPersonResponse {
  realmLinks: Array<{ realm: string; kcSub: string }>;
}

// ─── Organizations ──────────────────────────────────────────────

export interface IamOrgResponse {
  id: string;
  name: string;
  countryCode: string;
  primaryOwnerPersonId: string;
  status: string;
  suspendedAt?: string | null;
  suspendedReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Memberships ────────────────────────────────────────────────

export interface IamMembershipResponse {
  id: string;
  personId: string;
  organizationId: string;
  platformRole: PlatformRole;
  status: string;
  invitedBy?: string | null;
  invitedAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  revokedBy?: string | null;
  person?: {
    id: string;
    primaryEmail: string;
    displayName: string | null;
    emailVerified: boolean;
  } | null;
}

// ─── Paginated envelope (admin list_all) ────────────────────────

export interface IamPage<T> {
  items: T[];
  total: number;
}

// ─── Reply envelope ─────────────────────────────────────────────

export type IamReply<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export class IamError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly subject: string,
  ) {
    super(`${code}: ${message} [${subject}]`);
    this.name = 'IamError';
  }
}
