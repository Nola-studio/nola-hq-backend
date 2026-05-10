import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NolaAuthService, SilentLoginError } from '@nola-hq/nola-sdk';
import type { NolaJwtPayload } from '@nola-hq/nola-sdk';

import { TeamMember } from '../team/team-member.entity';
import { CookieConfigService } from './cookie-config';
import { SessionStoreService } from './session-store.service';

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
 * Auth HQ — port direct du pattern `kelasi-backend/apps/api-gateway/src/auth`.
 *
 *  1. `NolaAuthService.silentLogin()` fait un OIDC password grant côté
 *     Keycloak (realm `nola-hq`) via le BFF client retourné par le
 *     bootstrap NATS.
 *  2. Le JWT est vérifié contre les JWKS du realm.
 *  3. On chiffre le payload dans un cookie stateless AES-256-GCM
 *     (`nola_hq_session`) — la session HQ ne touche pas la DB à chaque
 *     requête, et un redéploy ne déconnecte personne.
 *
 *  La table `team_members` reste utilisée pour l'affichage du profil
 *  (avatar, role label, permissions UI) — mais ne gère plus de mot de
 *  passe : Keycloak est l'autorité.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(TeamMember)
    private readonly members: Repository<TeamMember>,
    private readonly nolaAuth: NolaAuthService,
    private readonly sessions: SessionStoreService,
    private readonly cookies: CookieConfigService,
  ) {}

  async login(input: LoginInput): Promise<LoginResult> {
    let tokens: { accessToken: string; refreshToken: string; expiresIn: number };
    let claims: NolaJwtPayload;

    try {
      tokens = await this.nolaAuth.silentLogin({
        email: input.email,
        password: input.password,
        ipAddress: input.ipAddress,
      });
      claims = await this.nolaAuth.verifyToken(tokens.accessToken);
    } catch (err) {
      if (err instanceof SilentLoginError) {
        if (err.status === 400 || err.status === 401) {
          throw new UnauthorizedException('invalid_credentials');
        }
        this.logger.warn(`silent_login http_${err.status}: ${err.body}`);
        throw new ServiceUnavailableException('auth_unavailable');
      }
      const isBootstrapErr =
        err instanceof Error &&
        /bootstrap|issuer|registration/i.test(err.message);
      if (isBootstrapErr) {
        this.logger.warn(`Login unavailable: ${(err as Error).message}`);
        throw new ServiceUnavailableException('auth_unavailable');
      }
      throw err;
    }

    if (!claims.tenant_id) {
      // La console HQ n'a qu'un seul « tenant » logique (la plateforme
      // elle-même). On force la valeur pour rester homogène avec les
      // autres services qui exigent un tenant_id non-vide.
      claims.tenant_id = 'nola-studio';
    }

    const ttl = this.cookies.cookie().ttlSeconds;
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

    const sessionId = this.sessions.create({
      userId: claims.sub,
      realm: claims.realm,
      tenantId: claims.tenant_id,
      email: claims.email,
      name: claims.name,
      roles: claims.roles ?? [],
      appsActives: claims.apps_actives ?? ['nola-hq'],
      modulesActifs: claims.modules_actifs ?? [],
      plan: claims.plan ?? 'admin',
      expiresAt,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    this.logger.log(`Login OK: ${claims.email ?? claims.sub} (${claims.sub})`);
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

  /**
   * Profil affichable côté UI. Lookup best-effort sur `team_members` par
   * email (Keycloak est l'autorité, la table locale ne sert qu'au display) ;
   * si le membre n'existe pas encore localement, on renvoie une projection
   * minimale construite depuis les claims.
   */
  async profile(userId: string, email?: string) {
    const m = email
      ? await this.members.findOne({ where: { email } })
      : await this.members.findOne({ where: { id: userId } });
    if (m) {
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
    return {
      id: userId,
      name: email ?? userId,
      email: email ?? '',
      role: 'member',
      tag: '',
      avatar: (email ?? userId).slice(0, 2).toUpperCase(),
      country: '',
      perms: [],
      online: true,
    };
  }
}
