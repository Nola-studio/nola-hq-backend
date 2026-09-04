import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { TeamMember, type TeamHqAccessLevel } from './team-member.entity';
import { KeycloakAdminService, type KcUser } from '../directory/keycloak-admin.service';
import { generateTempPassword } from './temp-password.util';
import type { HqAccessLevel } from './dto/invite-team-member.dto';

export interface UpdateTeamMemberDto {
  name?: string;
  role?: string;
  tag?: string;
  email?: string;
  country?: string;
  perms?: string[];
  online?: boolean;
  hqAccess?: HqAccessLevel;
  notifyEmail?: string | null;
}

export interface InviteTeamMemberData {
  name: string;
  email: string;
  role: string;
  tag?: string;
  country?: string;
  perms?: string[];
  hqAccess?: HqAccessLevel;
}

/** Outcome of the automatic Keycloak (realm `nola-hq`) provisioning. */
export interface KeycloakProvisionResult {
  /** A brand-new Keycloak account was created for this invite. */
  created: boolean;
  /** The account already existed (login was already possible). */
  existed?: boolean;
  userId?: string;
  realmRole?: string;
  roleAssigned?: boolean;
  passwordSet?: boolean;
  /**
   * Keycloak sent the "set your password" email (realm SMTP — Resend). When
   * true, no temporary password exists: the invitee sets their own via the
   * emailed link (24h validity).
   */
  emailSent?: boolean;
  /** One-time temporary password — fallback when the email could not be sent. */
  temporaryPassword?: string;
  /** Why provisioning was skipped/failed (e.g. keycloak_admin_not_configured). */
  reason?: string;
  error?: string;
}

const HQ_ACCESS_TO_REALM_ROLE: Record<HqAccessLevel, string> = {
  viewer: 'hq:viewer',
  operator: 'hq:operator',
  owner: 'hq:owner',
};

@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);

  constructor(
    @InjectRepository(TeamMember)
    private readonly repo: Repository<TeamMember>,
    private readonly kc: KeycloakAdminService,
    private readonly config: ConfigService,
  ) {}

  private hqRealm(): string {
    return this.config.get<string>('HQ_TEAM_REALM') ?? 'nola-hq';
  }

  findAll() {
    return this.repo
      .find({ order: { name: 'ASC' } })
      .then((members) => members.map(stripPassword));
  }

  async findOne(id: string) {
    const m = await this.repo.findOne({ where: { id } });
    if (!m) throw new NotFoundException(`Membre ${id} introuvable`);
    return stripPassword(m);
  }

  /**
   * "Who am I" as a `TeamMember` row, from the JWT's own email — every
   * caller that needs to act as *the current user* rather than look up
   * *someone else* (notifications' recipient scoping today; anything
   * else asking the same question later) should go through this rather
   * than inlining an `email` lookup, so there's exactly one place this
   * resolution lives. Raw entity, not stripped — for internal
   * service-to-service use, never serialized straight to a response.
   */
  async findByEmail(email: string): Promise<TeamMember | null> {
    return this.repo.findOne({ where: { email } });
  }

  /**
   * Every local `team_members` row entitled to see `businessUnitCode` —
   * `hq:owner` (sees every brand) union whoever holds `hq:bu:<code>`
   * directly. Same reverse role→users lookup `backfillMissingMembers`
   * already uses (`usersWithRealmRole`), just a different role name;
   * resolved back to local rows by email, so a Keycloak-only account
   * with no `team_members` row (nothing to key a notification/push to)
   * is silently excluded rather than erroring. Degraded mode (Keycloak
   * admin not configured) returns `[]`, same contract as every other
   * `KeycloakAdminService` consumer — a brand-created-ticket
   * notification simply reaches nobody rather than crashing ticket
   * creation.
   */
  async membersForBusinessUnit(businessUnitCode: string): Promise<TeamMember[]> {
    const realm = this.hqRealm();
    const [owners, brandScoped] = await Promise.all([
      this.kc.usersWithRealmRole(realm, 'hq:owner'),
      this.kc.usersWithRealmRole(realm, `hq:bu:${businessUnitCode}`),
    ]);
    const emails = new Set(
      [...owners, ...brandScoped].map((u) => u.email?.toLowerCase()).filter((e): e is string => !!e),
    );
    if (emails.size === 0) return [];
    const rows = await this.repo.find();
    return rows.filter((m) => emails.has(m.email.toLowerCase()));
  }

  /**
   * `actorEmail` is who's making the change — required to enforce the two
   * self-protection rules: you can't demote your own Owner role, and you
   * can't demote the last remaining Owner (yourself or anyone else).
   */
  async update(id: string, dto: UpdateTeamMemberDto, actorEmail: string) {
    const m = await this.repo.findOne({ where: { id } });
    if (!m) throw new NotFoundException(`Membre ${id} introuvable`);

    if (dto.hqAccess !== undefined && dto.hqAccess !== m.hqAccess && m.hqAccess === 'owner') {
      if (m.email.toLowerCase() === actorEmail.toLowerCase()) {
        throw new ForbiddenException('Vous ne pouvez pas retirer votre propre rôle Owner.');
      }
      const totalOwners = await this.repo.count({ where: { hqAccess: 'owner' } });
      if (totalOwners <= 1) {
        throw new ConflictException("Impossible de retirer le dernier Owner.");
      }
    }

    const previousHqAccess = m.hqAccess;
    Object.assign(m, dto);
    const saved = await this.repo.save(m);

    if (dto.hqAccess !== undefined && dto.hqAccess !== previousHqAccess) {
      const synced = await this.syncKeycloakRole(saved.email, previousHqAccess ?? null, dto.hqAccess);
      if (!synced) {
        // Roll back the DB change rather than leave HQ access and the
        // Keycloak realm role telling two different stories.
        saved.hqAccess = previousHqAccess ?? null;
        await this.repo.save(saved);
        throw new BadRequestException(
          'Le changement de rôle HQ a échoué côté Keycloak — rôle inchangé (voir logs).',
        );
      }
    }
    return stripPassword(saved);
  }

  /** Assigns the new `hq:*` realm role and removes the old one. Returns false on any Keycloak failure. */
  private async syncKeycloakRole(
    email: string,
    from: TeamHqAccessLevel | null,
    to: HqAccessLevel,
  ): Promise<boolean> {
    if (!this.kc.isConfigured()) return true; // degraded mode — nothing to sync against
    const realm = this.hqRealm();
    const user = await this.kc.findUserByEmail(realm, email);
    if (!user?.id) {
      this.logger.warn(`syncKeycloakRole: no Keycloak user for ${email}`);
      return false;
    }
    const assigned = await this.kc.assignRealmRole(realm, user.id, HQ_ACCESS_TO_REALM_ROLE[to]);
    if (!assigned) return false;
    if (from && from !== to) {
      await this.kc.removeRealmRole(realm, user.id, HQ_ACCESS_TO_REALM_ROLE[from]);
    }
    return true;
  }

  /**
   * Owner-only, idempotent: for every member with no persisted `hqAccess`,
   * looks up their Keycloak realm roles and backfills the highest `hq:*`
   * one found. Members with no matching Keycloak account (or no `hq:*`
   * role there) are left null and reported as `unresolved` — this never
   * guesses.
   */
  async backfillHqAccessFromKeycloak() {
    if (!this.kc.isConfigured()) {
      throw new BadRequestException('Keycloak admin non configuré — rien à synchroniser.');
    }
    const realm = this.hqRealm();
    const pending = await this.repo.find({ where: { hqAccess: IsNull() } });
    const resolved: string[] = [];
    const unresolved: string[] = [];
    for (const member of pending) {
      const user = await this.kc.findUserByEmail(realm, member.email);
      if (!user?.id) {
        unresolved.push(member.email);
        continue;
      }
      const roles = await this.kc.userRealmRoles(realm, user.id);
      const roleNames = new Set(roles.map((r) => r.name));
      const level = (['owner', 'operator', 'viewer'] as const).find(
        (l) => roleNames.has(HQ_ACCESS_TO_REALM_ROLE[l]),
      );
      if (!level) {
        unresolved.push(member.email);
        continue;
      }
      member.hqAccess = level;
      await this.repo.save(member);
      resolved.push(member.email);
    }
    return { resolved, unresolved };
  }

  /**
   * Owner-only, idempotent, manual (never run on boot): `backfillHqAccessFromKeycloak`
   * only repairs members that already have a `team_members` row. This covers the
   * other gap — a Keycloak user holding an `hq:*` realm role (real, enforced
   * access via `HqRolesGuard`) with no `team_members` row at all, e.g. an
   * account provisioned directly in Keycloak outside the `/team` invite flow.
   * Such a user is fully authorized but invisible on the Team page, since
   * `findAll()` only reads this table.
   *
   * For each `hq:*` role, strongest first, lists every Keycloak user holding
   * it directly (`usersWithRealmRole` — composites not expanded, matching
   * `userRealmRoles`'s own scope) and creates a row for any not already
   * present here, populated from their Keycloak claims. A user with no email
   * on their Keycloak account can't get a row (email is unique/required) and
   * is reported `skipped`, never guessed. Country is left unattributed
   * (`''`, same convention as `tenants.service.ts`) since Keycloak doesn't
   * carry it — never defaulted to a specific country.
   */
  async backfillMissingMembers() {
    if (!this.kc.isConfigured()) {
      throw new BadRequestException('Keycloak admin non configuré — rien à synchroniser.');
    }
    const realm = this.hqRealm();
    const existingEmails = new Set(
      (await this.repo.find()).map((m) => m.email.toLowerCase()),
    );

    const byEmail = new Map<string, { user: KcUser; level: TeamHqAccessLevel }>();
    for (const level of ['owner', 'operator', 'viewer'] as const) {
      const users = await this.kc.usersWithRealmRole(realm, HQ_ACCESS_TO_REALM_ROLE[level]);
      for (const user of users) {
        const email = user.email?.toLowerCase();
        if (!email || byEmail.has(email)) continue; // strongest role already recorded
        byEmail.set(email, { user, level });
      }
    }

    const created: string[] = [];
    const skipped: string[] = [];
    for (const [email, { user, level }] of byEmail) {
      if (existingEmails.has(email)) continue; // already has a team_members row
      if (!user.email) {
        skipped.push(`kc user ${user.id} holds ${HQ_ACCESS_TO_REALM_ROLE[level]} but has no email`);
        continue;
      }
      const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email;
      const saved = await this.repo.save(
        this.repo.create({
          id: deriveId(user.email),
          name,
          email: user.email,
          role: '',
          tag: '',
          avatar: deriveInitials(name),
          hue: Math.floor(Math.random() * 360),
          online: false,
          country: '',
          perms: [],
          hqAccess: level,
          notifyEmail: null,
          lastLoginAt: null,
          passwordHash: undefined,
        }),
      );
      this.logger.log(
        `backfillMissingMembers: created team_members row for ${saved.email} (hqAccess=${level}, source=Keycloak realm role)`,
      );
      created.push(saved.email);
    }
    return { created, skipped };
  }

  /**
   * Invite un nouveau membre HQ. Crée la row `team_members` (profil affichable)
   * PUIS provisionne automatiquement le compte Keycloak (realm `nola-hq`) :
   * création du compte, mot de passe temporaire (à changer à la 1ʳᵉ connexion)
   * et rôle realm (`hq:*`) correspondant au niveau d'accès. Best-effort : si
   * Keycloak admin n'est pas configuré ou échoue, la row reste créée et le
   * résultat le signale (l'UI affiche alors le message d'activation manuelle).
   */
  async invite(data: InviteTeamMemberData) {
    const existing = await this.repo.findOne({ where: { email: data.email } });
    if (existing) {
      throw new BadRequestException(
        `Un membre avec l'email ${data.email} existe déjà`,
      );
    }
    const saved = await this.repo.save(
      this.repo.create({
        id: deriveId(data.email),
        name: data.name,
        email: data.email,
        role: data.role,
        tag: data.tag ?? '',
        avatar: deriveInitials(data.name),
        hue: Math.floor(Math.random() * 360),
        online: false,
        // Stores what it's given — never guesses. An unset country lands as
        // '' (same "unattributed, not invented" convention as
        // tenants.service.ts's country resolution), surfaced as such in the
        // UI rather than silently defaulted to a specific country.
        country: data.country ?? '',
        perms: data.perms ?? [],
        hqAccess: data.hqAccess ?? 'viewer',
        notifyEmail: null,
        lastLoginAt: null,
        passwordHash: undefined,
      }),
    );
    const keycloak = await this.provisionKeycloak(data);
    return { ...stripPassword(saved), keycloak };
  }

  /**
   * Auto-provisions the Keycloak account for an invite. Never throws — returns a
   * structured outcome the controller/UI can act on. The temporary password is
   * returned exactly once (only for a freshly-created account) and is never
   * stored server-side.
   */
  private async provisionKeycloak(
    data: InviteTeamMemberData,
  ): Promise<KeycloakProvisionResult> {
    if (!this.kc.isConfigured()) {
      return { created: false, reason: 'keycloak_admin_not_configured' };
    }
    const realm = this.hqRealm();
    const realmRole = HQ_ACCESS_TO_REALM_ROLE[data.hqAccess ?? 'viewer'];
    try {
      const parts = data.name.trim().split(/\s+/);
      const firstName = parts[0] || undefined;
      const lastName = parts.length > 1 ? parts.slice(1).join(' ') : undefined;

      const existing = await this.kc.findUserByEmail(realm, data.email);
      if (existing?.id) {
        // Login already possible — don't clobber their password; just make sure
        // the access role is present.
        const roleAssigned = await this.kc.assignRealmRole(realm, existing.id, realmRole);
        return { created: false, existed: true, userId: existing.id, realmRole, roleAssigned };
      }

      const userId = await this.kc.createUser(realm, {
        email: data.email,
        firstName,
        lastName,
      });
      if (!userId) return { created: false, error: 'keycloak_create_failed' };

      const roleAssigned = await this.kc.assignRealmRole(realm, userId, realmRole);

      // Preferred path (same as kelasi invites): Keycloak emails a one-shot
      // "set your password" link via the realm SMTP (Resend) — no password
      // ever transits. Falls back to a one-time temporary password when the
      // realm has no SMTP or the send fails.
      const emailSent = await this.kc.executeActionsEmail(realm, userId, ['UPDATE_PASSWORD']);
      if (emailSent) {
        return { created: true, userId, realmRole, roleAssigned, emailSent: true };
      }

      // PERMANENT password (temporary=false), like kelasi's issued credentials:
      // the HQ login is an OIDC password grant (ROPC), and Keycloak refuses the
      // grant while an UPDATE_PASSWORD required action is pending ("Account is
      // not fully set up" → 401 invalid_credentials at the BFF). The password
      // is still one-time-displayed; changing it after first login is advice,
      // not enforcement.
      const temporaryPassword = generateTempPassword();
      const passwordSet = await this.kc.resetPassword(realm, userId, temporaryPassword, false);

      return {
        created: true,
        userId,
        realmRole,
        roleAssigned,
        passwordSet,
        emailSent: false,
        temporaryPassword: passwordSet ? temporaryPassword : undefined,
      };
    } catch (e) {
      this.logger.warn(
        `Keycloak provisioning failed for ${data.email}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return { created: false, error: 'keycloak_error' };
    }
  }

  /**
   * `actorEmail` guards the same two rules as `update()`'s role-demotion
   * path: you can't remove yourself while you're the Owner, and you can't
   * remove the last remaining Owner.
   *
   * Keycloak deprovisioning is intentionally NOT done here yet — see the
   * P0 security report: removing a member today only deletes this row,
   * leaving their Keycloak account and `hq:*` realm role fully active.
   */
  async remove(id: string, actorEmail: string) {
    const m = await this.repo.findOne({ where: { id } });
    if (!m) throw new NotFoundException(`Membre ${id} introuvable`);
    if (m.hqAccess === 'owner') {
      if (m.email.toLowerCase() === actorEmail.toLowerCase()) {
        throw new ForbiddenException('Vous ne pouvez pas vous retirer vous-même en tant que Owner.');
      }
      const totalOwners = await this.repo.count({ where: { hqAccess: 'owner' } });
      if (totalOwners <= 1) {
        throw new ConflictException('Impossible de retirer le dernier Owner.');
      }
    }
    await this.repo.remove(m);
    return { ok: true };
  }
}

function stripPassword(m: TeamMember): Omit<TeamMember, 'passwordHash'> {
  const { passwordHash, ...rest } = m;
  void passwordHash;
  return rest;
}

/** Shared by `invite()` and `backfillMissingMembers()` — the row's primary key, derived from the email's local part. */
function deriveId(email: string): string {
  return email.split('@')[0]?.replace(/[^a-z0-9]+/gi, '') || `m${Date.now()}`;
}

/** Shared by `invite()` and `backfillMissingMembers()` — up to two initials for the avatar. */
function deriveInitials(name: string): string {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
  return initials || 'NA';
}
