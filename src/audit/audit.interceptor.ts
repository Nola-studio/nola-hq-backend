import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { EventBus } from '@nola-studio/sdk';
import type { Request } from 'express';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { NolaClientService } from '@nola-hq/nola-sdk';
import { AuditService } from './audit.service';
import type { AuthenticatedUser } from '../common/auth/current-user.decorator';

/**
 * Methods that mutate state. GETs are read-only — we don't audit them
 * (would flood the table with noise). Add HEAD/OPTIONS if ever needed,
 * but they don't carry side effects either.
 */
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Routes excluded from audit logging — they're either auth-flow
 * primitives (login/logout) or internal hot paths that would explode
 * the audit volume without providing actionable trail.
 */
const SKIP_PATH_PREFIXES = [
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/health/ping',
];

/**
 * Captures every mutating HTTP request in the HQ backend and writes an
 * audit row both to local Postgres (queryable from the Audit page) AND
 * to JetStream (`nola.events.nola.audit.hq.<action>`) so the trail
 * survives a HQ DB wipe and can be consumed by other services
 * (alerting, compliance exports, …).
 *
 * The action label is the HTTP method + path with route params kept
 * as-is — we accept the cardinality hit on the index because it makes
 * the trail directly grep-able (e.g. `PATCH /api/v1/plans/<uuid>`).
 *
 * The meta column carries:
 *   - status code (200/204/4xx/5xx)
 *   - durationMs
 *   - body diff sketch (keys touched, values redacted for security
 *     fields). NOT a full snapshot — full diffs are too risky to write
 *     into a generic audit table.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);
  private eventBus: EventBus | null = null;

  constructor(
    private readonly audit: AuditService,
    private readonly nolaClient: NolaClientService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const method = (req.method ?? 'GET').toUpperCase();
    const path = req.originalUrl ?? req.url ?? '';

    if (!MUTATING_METHODS.has(method)) return next.handle();
    if (SKIP_PATH_PREFIXES.some((p) => path.startsWith(p))) {
      return next.handle();
    }

    const start = Date.now();
    const actorSub = req.user?.sub ?? 'anonymous';
    const actorEmail = req.user?.email ?? '';
    const ip = extractIp(req);
    const targetId = extractTargetId(path);
    const bodySketch = summariseBody(req.body);

    return next.handle().pipe(
      tap(() => {
        void this.persist({
          method,
          path,
          actor: actorEmail || actorSub,
          actorSub,
          ip,
          target: targetId,
          status: 'success',
          durationMs: Date.now() - start,
          bodySketch,
        });
      }),
      catchError((err) => {
        void this.persist({
          method,
          path,
          actor: actorEmail || actorSub,
          actorSub,
          ip,
          target: targetId,
          status: 'error',
          durationMs: Date.now() - start,
          bodySketch,
          errorCode: err?.code ?? err?.status ?? 'unknown',
          errorMessage: err?.message ?? String(err),
        });
        return throwError(() => err);
      }),
    );
  }

  private async persist(record: {
    method: string;
    path: string;
    actor: string;
    actorSub: string;
    ip: string;
    target: string;
    status: 'success' | 'error';
    durationMs: number;
    bodySketch: Record<string, unknown>;
    errorCode?: unknown;
    errorMessage?: string;
  }): Promise<void> {
    const action = `${record.method} ${normalisePath(record.path)}`;
    const metaJson = JSON.stringify({
      status: record.status,
      durationMs: record.durationMs,
      body: record.bodySketch,
      ...(record.errorCode !== undefined && {
        errorCode: record.errorCode,
        errorMessage: record.errorMessage,
      }),
    });

    // Local Postgres — never let an audit failure abort the request.
    try {
      await this.audit.record({
        actor: record.actor,
        action,
        target: record.target,
        ip: record.ip,
        meta: metaJson,
      });
    } catch (err) {
      this.logger.warn(
        `audit local persist failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    // JetStream durable copy. Lazy-init the EventBus on first call so
    // the constructor doesn't have to wait for NATS readiness.
    if (!this.eventBus && this.nolaClient.isReady()) {
      try {
        this.eventBus = new EventBus(this.nolaClient.getClient());
        await this.eventBus.init();
      } catch (err) {
        this.logger.debug(
          `audit EventBus init failed: ${err instanceof Error ? err.message : err}`,
        );
        this.eventBus = null;
      }
    }
    if (this.eventBus) {
      // Subject ends with the action verb so subscribers can filter.
      const verb = record.method.toLowerCase();
      const subject = `nola.events.nola.audit.hq.${verb}`;
      await this.eventBus.emit(
        subject,
        {
          action,
          actor: record.actor,
          actorSub: record.actorSub,
          target: record.target,
          ip: record.ip,
          status: record.status,
          durationMs: record.durationMs,
          body: record.bodySketch,
          ...(record.errorCode !== undefined && {
            errorCode: record.errorCode,
            errorMessage: record.errorMessage,
          }),
        },
        'nola-hq',
      );
    }
  }
}

/* ─── helpers ────────────────────────────────────────────────── */

const REDACTED_KEYS = new Set([
  'password',
  'token',
  'secret',
  'apiKey',
  'authorization',
  'bootstrapSecret',
  'natsPass',
  'natsPassword',
]);

/**
 * Reduces a request body to a "diff sketch" — list of keys touched,
 * with sensitive values redacted and complex values stringified. The
 * goal is to know WHAT was changed without leaking secrets or blowing
 * up the column size.
 */
function summariseBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(k)) {
      out[k] = '[redacted]';
      continue;
    }
    if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    } else if (Array.isArray(v)) {
      out[k] = `[array:${v.length}]`;
    } else {
      out[k] = '[object]';
    }
  }
  return out;
}

function extractIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0]!.trim();
  if (Array.isArray(fwd) && fwd.length > 0) return fwd[0]!.split(',')[0]!.trim();
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

/**
 * Tries to pull the most "interesting" id out of the path so the
 * `target` column is useful for filtering. Falls back to the path
 * itself when no obvious id is present.
 */
function extractTargetId(path: string): string {
  // Strip query string.
  const clean = path.split('?')[0]!;
  const parts = clean.split('/').filter(Boolean);
  // The last UUID-looking or long-id segment wins; otherwise the
  // last path segment.
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const seg = parts[i]!;
    if (/^[0-9a-fA-F-]{20,}$/.test(seg) || /^[a-z0-9_-]{8,}$/i.test(seg)) {
      return seg;
    }
  }
  return parts[parts.length - 1] ?? clean;
}

/**
 * Replace UUID-like segments in the path with `:id` so different
 * targets hitting the same endpoint share an `action` label and the
 * audit log groups cleanly.
 */
function normalisePath(path: string): string {
  return path
    .split('?')[0]!
    .replace(/\/[0-9a-fA-F-]{20,}(?=\/|$)/g, '/:id');
}
