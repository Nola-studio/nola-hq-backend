import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';

import { TeamMember } from '../team/team-member.entity';
import { CookieConfigService } from './cookie-config';
import { SessionStoreService } from './session-store.service';
import type { NolaJwtPayload } from '../common/auth/nola-jwt-payload';

const HQ_REALM = 'nola-hq';
const HQ_TENANT = 'nola-studio';
const HQ_PLAN = 'admin';
const HQ_APPS_ACTIVES = ['nola-hq'];

export interface LoginInput {
  email: string;
  password: string;
  ipAddress: string;
  userAgent?: string;
}

export interface LoginResult {
  sessionId: string;
  user: NolaJwtPayload;
  expiresIn: number;
}

/**
 * Auth HQ — port du pattern `kelasi-backend` :
 *  - même forme de claims (`NolaJwtPayload`)
 *  - même cookie chiffré stateless (AES-256-GCM)
 *  - mêmes codes d'erreur (`invalid_credentials`, `missing_session`,
 *    `session_expired`, `user_missing_tenant_id`).
 *
 * Différence : pas de Keycloak. Les utilisateurs HQ sont l'équipe interne
 * Nola Studio, on vérifie le mot de passe contre `team_members.password_hash`
 * (bcrypt, factor 8). Si plus tard on bascule sur Keycloak, seule cette
 * couche change — le reste du backend consomme déjà la même forme de claims.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(TeamMember)
    private readonly members: Repository<TeamMember>,
    private readonly sessions: SessionStoreService,
    private readonly cookies: CookieConfigService,
  ) {}

  async login(input: LoginInput): Promise<LoginResult> {
    const member = await this.members.findOne({
      where: { email: input.email },
    });
    if (!member || !member.passwordHash) {
      throw new UnauthorizedException('invalid_credentials');
    }
    const ok = await bcrypt.compare(input.password, member.passwordHash);
    if (!ok) throw new UnauthorizedException('invalid_credentials');

    const ttl = this.cookies.cookie().ttlSeconds;
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

    const claims: NolaJwtPayload = {
      sub: member.id,
      realm: HQ_REALM,
      tenant_id: HQ_TENANT,
      email: member.email,
      name: member.name,
      roles: member.perms,
      apps_actives: HQ_APPS_ACTIVES,
      modules_actifs: [],
      plan: HQ_PLAN,
    };

    if (!claims.tenant_id) {
      throw new UnauthorizedException('user_missing_tenant_id');
    }

    const sessionId = this.sessions.create({
      userId: claims.sub,
      realm: claims.realm,
      tenantId: claims.tenant_id,
      email: claims.email,
      name: claims.name,
      roles: claims.roles,
      appsActives: claims.apps_actives,
      modulesActifs: claims.modules_actifs,
      plan: claims.plan,
      expiresAt,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    this.logger.log(`Login OK: ${member.email} (${member.id})`);
    return { sessionId, user: claims, expiresIn: ttl };
  }

  resolveSession(sessionId: string): NolaJwtPayload {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new UnauthorizedException('session_not_found');
    }
    if (Date.parse(session.expiresAt) < Date.now()) {
      throw new UnauthorizedException('session_expired');
    }
    return {
      sub: session.userId,
      realm: session.realm,
      tenant_id: session.tenantId,
      email: session.email,
      name: session.name,
      apps_actives: session.appsActives,
      modules_actifs: session.modulesActifs,
      plan: session.plan,
      roles: session.roles,
    };
  }

  logout(_sessionId: string): void {
    // Stateless — le contrôleur fait `res.clearCookie()`.
  }

  cookieName(): string {
    return this.cookies.cookie().name;
  }

  async profile(userId: string) {
    const m = await this.members.findOne({ where: { id: userId } });
    if (!m) throw new UnauthorizedException('not_authenticated');
    return {
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      tag: m.tag,
      avatar: m.avatar,
      country: m.country,
      perms: m.perms,
      online: m.online,
    };
  }
}
