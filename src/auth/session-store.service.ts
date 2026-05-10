import { Injectable, Logger } from '@nestjs/common';
import { SessionCipherService } from './session-cipher.service';

/**
 * Session "store" sans état — la valeur du cookie porte tout le payload
 * chiffré (claims). Calque exact du pattern utilisé par
 * `kelasi-backend/apps/api-gateway/src/auth/session-store.service.ts`.
 */
@Injectable()
export class SessionStoreService {
  private readonly logger = new Logger(SessionStoreService.name);

  constructor(private readonly cipher: SessionCipherService) {}

  create(payload: CreateSessionInput): string {
    const session: SessionPayload = {
      v: 1,
      userId: payload.userId,
      realm: payload.realm,
      tenantId: payload.tenantId,
      email: payload.email,
      name: payload.name,
      roles: payload.roles ?? [],
      appsActives: payload.appsActives ?? [],
      modulesActifs: payload.modulesActifs ?? [],
      plan: payload.plan ?? 'admin',
      expiresAt: payload.expiresAt,
      ipAddress: payload.ipAddress,
      userAgent: payload.userAgent,
      issuedAt: new Date().toISOString(),
    };
    return this.cipher.encrypt(JSON.stringify(session));
  }

  get(token: string): StoredSession | undefined {
    if (!token) return undefined;
    let payload: SessionPayload;
    try {
      payload = JSON.parse(this.cipher.decrypt(token)) as SessionPayload;
    } catch (err) {
      this.logger.debug(
        `session decode failed: ${err instanceof Error ? err.message : err}`,
      );
      return undefined;
    }
    if (payload.v !== 1) return undefined;
    return {
      userId: payload.userId,
      realm: payload.realm,
      tenantId: payload.tenantId,
      email: payload.email,
      name: payload.name,
      roles: payload.roles ?? [],
      appsActives: payload.appsActives ?? [],
      modulesActifs: payload.modulesActifs ?? [],
      plan: payload.plan ?? 'admin',
      expiresAt: payload.expiresAt,
      issuedAt: payload.issuedAt,
      ipAddress: payload.ipAddress ?? '0.0.0.0',
      userAgent: payload.userAgent,
    };
  }

  /** Stateless — placeholder pour basculer plus tard sur une revocation list. */
  delete(_token: string): void {
    // intentional no-op
  }
}

interface SessionPayload {
  v: 1;
  userId: string;
  realm: string;
  tenantId: string;
  email?: string;
  name?: string;
  roles: string[];
  appsActives: string[];
  modulesActifs: string[];
  plan: string;
  expiresAt: string;
  issuedAt: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateSessionInput {
  userId: string;
  realm: string;
  tenantId: string;
  email?: string;
  name?: string;
  roles?: string[];
  appsActives?: string[];
  modulesActifs?: string[];
  plan?: string;
  expiresAt: string;
  ipAddress: string;
  userAgent?: string;
}

export interface StoredSession {
  userId: string;
  realm: string;
  tenantId: string;
  email?: string;
  name?: string;
  roles: string[];
  appsActives: string[];
  modulesActifs: string[];
  plan: string;
  expiresAt: string;
  issuedAt: string;
  ipAddress: string;
  userAgent?: string;
}
