import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { CookieConfigService } from './cookie-config';

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * Chiffrement symétrique de la session (port direct de
 * `kelasi-backend/apps/api-gateway/src/auth/session-cipher.service.ts`).
 * Le cookie envoyé au client est `base64url(iv | tag | ciphertext)`.
 */
@Injectable()
export class SessionCipherService {
  private readonly key: Buffer;

  constructor(private readonly config: CookieConfigService) {
    const raw = Buffer.from(config.cookie().encryptionKeyBase64, 'base64');
    if (raw.length !== 32) {
      throw new Error(
        `SESSION_ENCRYPTION_KEY must decode to 32 bytes, got ${raw.length}`,
      );
    }
    this.key = raw;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALG, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64url');
  }

  decrypt(token: string): string {
    const buf = Buffer.from(token, 'base64url');
    if (buf.length < IV_LEN + TAG_LEN) {
      throw new Error('Invalid session token');
    }
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const encrypted = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALG, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  }
}
