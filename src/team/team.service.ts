import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeamMember } from './team-member.entity';
import { KeycloakAdminService } from '../directory/keycloak-admin.service';
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
  /** One-time temporary password — present ONLY when a new account was created. */
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

  async update(id: string, dto: UpdateTeamMemberDto) {
    const m = await this.repo.findOne({ where: { id } });
    if (!m) throw new NotFoundException(`Membre ${id} introuvable`);
    Object.assign(m, dto);
    const saved = await this.repo.save(m);
    return stripPassword(saved);
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
    const id = data.email.split('@')[0]?.replace(/[^a-z0-9]+/gi, '') || `m${Date.now()}`;
    const initials = data.name
      .split(/\s+/)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2);
    const saved = await this.repo.save(
      this.repo.create({
        id,
        name: data.name,
        email: data.email,
        role: data.role,
        tag: data.tag ?? '',
        avatar: initials || 'NA',
        hue: Math.floor(Math.random() * 360),
        online: false,
        country: data.country ?? 'CD',
        perms: data.perms ?? [],
        last: 'jamais',
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

      const temporaryPassword = generateTempPassword();
      const passwordSet = await this.kc.resetPassword(realm, userId, temporaryPassword, true);
      const roleAssigned = await this.kc.assignRealmRole(realm, userId, realmRole);

      return {
        created: true,
        userId,
        realmRole,
        roleAssigned,
        passwordSet,
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

  async remove(id: string) {
    const m = await this.repo.findOne({ where: { id } });
    if (!m) throw new NotFoundException(`Membre ${id} introuvable`);
    await this.repo.remove(m);
    return { ok: true };
  }
}

function stripPassword(m: TeamMember): Omit<TeamMember, 'passwordHash'> {
  const { passwordHash, ...rest } = m;
  void passwordHash;
  return rest;
}
