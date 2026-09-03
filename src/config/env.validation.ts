import { plainToInstance } from 'class-transformer';
import { IsOptional, IsString, validateSync } from 'class-validator';

/**
 * Boot-time environment validation. Fails fast with a clear message instead of
 * letting a missing/placeholder secret cause silent runtime failures (wrong
 * NATS creds → empty data; missing session key → cipher throws on first login).
 */
export class EnvironmentVariables {
  // Always required — the session cipher needs a 32-byte base64 key.
  @IsString()
  SESSION_ENCRYPTION_KEY!: string;

  @IsOptional() @IsString() DATABASE_URL?: string;
  @IsOptional() @IsString() DB_PATH?: string;
  @IsOptional() @IsString() ATTACHMENTS_DIR?: string;
  @IsOptional() @IsString() NATS_URL?: string;
  @IsOptional() @IsString() NATS_USER?: string;
  @IsOptional() @IsString() NATS_PASS?: string;
  @IsOptional() @IsString() CORS_ORIGINS?: string;
  // Base URL of the public-facing console — used to build the receipt
  // verification link embedded in the QR code (business-pdf.service.ts).
  @IsOptional() @IsString() PUBLIC_APP_URL?: string;
  @IsOptional() @IsString() SESSION_COOKIE_SECURE?: string;
  @IsOptional() @IsString() NODE_ENV?: string;
  @IsOptional() @IsString() PORT?: string;
  // Web Push (PWA) — optionnels : sans clés VAPID le push est simplement
  // désactivé (mode dégradé du PushService), rien d'autre n'en dépend.
  @IsOptional() @IsString() VAPID_PUBLIC_KEY?: string;
  @IsOptional() @IsString() VAPID_PRIVATE_KEY?: string;
  @IsOptional() @IsString() VAPID_SUBJECT?: string;
  // Read-only, repo-scoped PAT for deployment ticket commit-range lookups
  // (GithubService) — optional: unset just disables the composer's
  // GitHub compare call (degraded mode, matches KeycloakAdminService's
  // contract). Deliberately not the GITHUB_TOKEN already present in this
  // app's environment — that one's scope was never verified for this use.
  @IsOptional() @IsString() DEPLOYMENT_GITHUB_TOKEN?: string;
}

/** base64 of 32 zero bytes — the dev placeholder that must never reach prod. */
const PLACEHOLDER_SESSION_KEY = Buffer.alloc(32).toString('base64');

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const missing = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(
      `\n[nola-hq] Missing or invalid environment variables:\n${missing}\n`,
    );
  }

  // Production-only gates — keep dev frictionless, fail closed in prod.
  if ((validated.NODE_ENV ?? 'development') === 'production') {
    const problems: string[] = [];
    if (!validated.DATABASE_URL) {
      problems.push('DATABASE_URL is required in production (no SQLite fallback).');
    }
    if (!validated.CORS_ORIGINS?.trim()) {
      problems.push('CORS_ORIGINS must list the console URL(s) — empty would block or, worse, reflect every origin.');
    }
    if (validated.SESSION_ENCRYPTION_KEY === PLACEHOLDER_SESSION_KEY) {
      problems.push('SESSION_ENCRYPTION_KEY is the all-zero dev placeholder — generate a real key (`openssl rand -base64 32`).');
    }
    if (validated.SESSION_COOKIE_SECURE !== 'true') {
      problems.push('SESSION_COOKIE_SECURE must be "true" in production — the session cookie must not ship without Secure.');
    }
    if (!validated.ATTACHMENTS_DIR?.trim()) {
      problems.push('ATTACHMENTS_DIR is required in production — the relative-path fallback lands on ephemeral container disk and loses attachments on every redeploy.');
    }
    if (!validated.PUBLIC_APP_URL?.trim()) {
      problems.push('PUBLIC_APP_URL is required in production — receipt QR codes need it to build a working verification link.');
    } else if (!isAbsoluteHttpUrl(validated.PUBLIC_APP_URL)) {
      problems.push('PUBLIC_APP_URL must be an absolute http(s) URL — a malformed value still produces a QR code, just one that points nowhere.');
    }
    if (problems.length) {
      throw new Error(
        `\n[nola-hq] Invalid production configuration:\n${problems
          .map((p) => `  - ${p}`)
          .join('\n')}\n`,
      );
    }
  }

  return validated;
}
