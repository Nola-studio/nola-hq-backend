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
  @IsOptional() @IsString() NATS_URL?: string;
  @IsOptional() @IsString() NATS_USER?: string;
  @IsOptional() @IsString() NATS_PASS?: string;
  @IsOptional() @IsString() CORS_ORIGINS?: string;
  @IsOptional() @IsString() SESSION_COOKIE_SECURE?: string;
  @IsOptional() @IsString() NODE_ENV?: string;
  @IsOptional() @IsString() PORT?: string;
  // Web Push (PWA) — optionnels : sans clés VAPID le push est simplement
  // désactivé (mode dégradé du PushService), rien d'autre n'en dépend.
  @IsOptional() @IsString() VAPID_PUBLIC_KEY?: string;
  @IsOptional() @IsString() VAPID_PRIVATE_KEY?: string;
  @IsOptional() @IsString() VAPID_SUBJECT?: string;
}

/** base64 of 32 zero bytes — the dev placeholder that must never reach prod. */
const PLACEHOLDER_SESSION_KEY = Buffer.alloc(32).toString('base64');

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
