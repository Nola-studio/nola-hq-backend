import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

export interface Handoff {
  /** Impersonated access token (short-lived) — the app derives the session
   *  from this. The refresh token is bound to the impersonator client and is
   *  intentionally not rotatable by the app (impersonation = short-lived). */
  accessToken: string;
  refreshToken: string;
  realm: string;
  app: string;
  mode: 'read' | 'write';
  by: string;
  byName?: string;
  reason: string;
  targetUserId: string;
  expiresAt: number;
}

const TTL_MS = 60_000; // one-time code valid 60s — the app must redeem fast

/**
 * Short-lived, one-time handoff codes for assisted access. The impersonated
 * refresh token is held server-side only; the HQ browser never sees it — it
 * receives an opaque code that the target app redeems back-channel.
 */
@Injectable()
export class HandoffStore {
  private readonly map = new Map<string, Handoff>();

  create(entry: Omit<Handoff, 'expiresAt'>): { code: string; expiresAt: number } {
    this.sweep();
    const code = randomBytes(24).toString('base64url');
    const expiresAt = Date.now() + TTL_MS;
    this.map.set(code, { ...entry, expiresAt });
    return { code, expiresAt };
  }

  /** Redeem + delete (single use). Returns null if unknown/expired. */
  redeem(code: string): Handoff | null {
    this.sweep();
    const entry = this.map.get(code);
    if (!entry) return null;
    this.map.delete(code);
    if (entry.expiresAt < Date.now()) return null;
    return entry;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [code, e] of this.map) {
      if (e.expiresAt < now) this.map.delete(code);
    }
  }
}
