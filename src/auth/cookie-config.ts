import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CookieConfig {
  name: string;
  domain?: string;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  encryptionKeyBase64: string;
  /** Durée de vie de la session en secondes. */
  ttlSeconds: number;
}

@Injectable()
export class CookieConfigService {
  constructor(private readonly config: ConfigService) {}

  cookie(): CookieConfig {
    const raw = (
      this.config.get<string>('SESSION_COOKIE_SAMESITE') ?? 'lax'
    ).toLowerCase();
    const sameSite: CookieConfig['sameSite'] =
      raw === 'strict' || raw === 'lax' || raw === 'none' ? raw : 'lax';
    return {
      name:
        this.config.get<string>('SESSION_COOKIE_NAME') ?? 'nola_hq_session',
      domain: this.config.get<string>('SESSION_COOKIE_DOMAIN') || undefined,
      secure: this.config.get<string>('SESSION_COOKIE_SECURE') === 'true',
      sameSite,
      encryptionKeyBase64:
        this.config.get<string>('SESSION_ENCRYPTION_KEY') ??
        // 32 zero bytes — dev only, override en production.
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      ttlSeconds: Number(
        this.config.get<string>('SESSION_TTL_SECONDS') ?? 12 * 60 * 60,
      ),
    };
  }
}
