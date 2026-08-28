import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventBus } from '@nola-studio/sdk';
import { NolaClientService } from '@nola-hq/nola-sdk';
import { AppsService, type AppProjection } from '../apps/apps.service';
import { PushService } from '../push/push.service';

/* ─── public read model ─────────────────────────────────────── */

export type HealthStatus = 'operational' | 'degraded' | 'down';

export interface HealthRow {
  id: string;
  name: string;
  /** Topology kind — `service` = platform-internal (nola-*), `app` =
   *  customer-facing application backend (kelasi, kriver, …). Lets the
   *  HQ Health page group internal services apart from client backends. */
  kind: AppProjection['kind'];
  /** Last HTTP liveness probe result: `true` = process answers HTTP,
   *  `false` = it doesn't, `null` = not probed. Lets the UI flag
   *  "heartbeat lost on the bus but HTTP still up". */
  httpReachable: boolean | null;
  uptime: number; // 0-100
  p50: number | null;
  p99: number | null;
  errors24h: number;
  status: HealthStatus;
  /** 24 hourly buckets, oldest → newest. 0-100 wellness score per bucket. */
  series: number[];
  /**
   * 24 hourly buckets of the worst-case p99 latency observed in each
   * hour, in milliseconds. `null` when no metrics received yet for the service.
   * Drives the cross-service latency chart on the Health page.
   */
  p99Series: number[] | null;
}

export interface HealthIncident {
  id: string;
  serviceId: string;
  serviceName: string;
  severity: 'P1' | 'P2' | 'P3';
  state: 'open' | 'closed';
  reason: string;
  openedAt: string;
  closedAt: string | null;
  /** Milliseconds between openedAt and closedAt (or now if still open). */
  durationMs: number;
}

/* ─── implementation ────────────────────────────────────────── */

const BUCKETS_24H = 24;
const BUCKET_MS = 60 * 60 * 1000;
const SAMPLE_INTERVAL_MS = 5 * 60 * 1000;
const MAX_RECENT_INCIDENTS = 200;
const HEALTH_STREAM = 'NOLA_HQ_EVENTS';
const SNAPSHOT_CONSUMER = 'nola-hq-health-snapshot-projection';
const INCIDENT_CONSUMER = 'nola-hq-health-incident-projection';
const METRICS_CONSUMER = 'nola-hq-health-metrics-projection';

/** Shape published by the SDK's MetricsRecorder every 60s. */
interface MetricsSnapshotEvent {
  service: string;
  windowStart: string;
  windowEnd: string;
  requestCount: number;
  errorCount: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

/**
 * Per-service rolling error counter — 24 one-hour buckets aligned on
 * wall-clock. Mirrors the wellness ring's structure so they share the
 * advance() helper.
 */
interface ErrorRing {
  bucketStartMs: number;
  cursor: number;
  buckets: number[];
}

interface RingBuffer {
  bucketStartMs: number;
  cursor: number;
  series: number[];
}

interface SnapshotEvent {
  serviceId: string;
  serviceName: string;
  status: AppProjection['status'];
  score: number;
  timestamp: string;
}

/**
 * HealthService — "lite Datadog" projection layer.
 *
 * Two data flows, both backed by JetStream so state survives nola-hq
 * restarts:
 *
 *   1. **Snapshots** — every 5 min the sampler observes the registry's
 *      `online | degraded | offline` for each service and emits one
 *      `nola.events.nola.health.snapshot.<id>`. The replay consumer at
 *      boot rebuilds the 24h ring buffer from these.
 *
 *   2. **Incidents** — status transitions away from `online` open an
 *      incident, transitions back close it. Both states are emitted as
 *      `nola.events.nola.health.incident.<id>` so the HQ console can
 *      render a real (not hardcoded) incident feed.
 *
 * Latency / error counters stay at 0 until a real OTEL collector is
 * wired in — that's the next slice.
 */
@Injectable()
export class HealthService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(HealthService.name);
  private readonly rings = new Map<string, RingBuffer>();
  private readonly lastStatus = new Map<string, AppProjection['status']>();
  private readonly openIncidents = new Map<string, HealthIncident>();
  private readonly recentIncidents: HealthIncident[] = [];
  /** Last metrics snapshot received per service — feeds the p50/p99
   *  columns in the Health page. Reset to the latest 60s window every
   *  time a fresh snapshot lands. */
  private readonly lastMetrics = new Map<string, MetricsSnapshotEvent>();
  /** 24h rolling error counts per service, populated from the
   *  errorCount field of every snapshot. */
  private readonly errorRings = new Map<string, ErrorRing>();
  /** 24h rolling worst-case p99 latency per service (ms). Each hourly
   *  bucket stores the max p99 observed across the snapshots that
   *  landed in that hour — keeps the spikes visible instead of
   *  averaging them out. */
  private readonly latencyRings = new Map<string, ErrorRing>();
  private eventBus: EventBus | null = null;
  private samplerTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly apps: AppsService,
    private readonly nolaClient: NolaClientService,
    private readonly push: PushService,
  ) {}

  onApplicationBootstrap(): void {
    void this.bootstrap();
  }

  onModuleDestroy(): void {
    if (this.samplerTimer) clearInterval(this.samplerTimer);
  }

  private async bootstrap(): Promise<void> {
    // Wait for NATS (apps.service does the same dance — it can take a
    // minute after boot before NolaClient is connected via bootstrap).
    for (let i = 0; i < 30 && !this.nolaClient.isReady(); i += 1) {
      await this.sleep(4_000);
    }
    if (!this.nolaClient.isReady()) {
      this.logger.warn(
        'NolaClient not ready after 30 attempts — health persistence disabled',
      );
      this.startSampler(false);
      return;
    }

    try {
      this.eventBus = new EventBus(this.nolaClient.getClient());
      await this.eventBus.ensureStream({
        name: HEALTH_STREAM,
        subjects: [
          'nola.events.nola.health.snapshot.>',
          'nola.events.nola.health.incident.>',
          'nola.events.metrics.>',
        ],
        max_age: 30 * 24 * 60 * 60 * 1_000_000_000,
      });

      await this.recreateConsumers();

      await this.eventBus.consume<SnapshotEvent>(
        HEALTH_STREAM,
        SNAPSHOT_CONSUMER,
        'nola.events.nola.health.snapshot.>',
        async (env) => {
          if (env.payload) this.applySnapshot(env.payload);
        },
      );
      await this.eventBus.consume<HealthIncident>(
        HEALTH_STREAM,
        INCIDENT_CONSUMER,
        'nola.events.nola.health.incident.>',
        async (env) => {
          if (env.payload) this.applyIncident(env.payload);
        },
      );

      // Metrics consumer — pulls every service's p50/p99/error
      // snapshot published by the SDK's MetricsRecorder. One event
      // per (service, 60s window).
      await this.eventBus.consume<MetricsSnapshotEvent>(
        HEALTH_STREAM,
        METRICS_CONSUMER,
        'nola.events.metrics.>',
        async (env) => {
          if (env.payload) this.applyMetrics(env.payload);
        },
      );

      this.logger.log('Health projection ready — consumers attached');
    } catch (err) {
      this.logger.error(
        `Health bootstrap failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    this.startSampler(true);
  }

  private async recreateConsumers(): Promise<void> {
    if (!this.nolaClient.isReady()) return;
    try {
      const nc = this.nolaClient.getClient().getConnection();
      const jsm = await nc.jetstreamManager();
      for (const name of [SNAPSHOT_CONSUMER, INCIDENT_CONSUMER, METRICS_CONSUMER]) {
        await jsm.consumers.delete(HEALTH_STREAM, name).catch(() => undefined);
      }
    } catch (err) {
      this.logger.debug(
        `Could not pre-clear health consumers: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private startSampler(persist: boolean): void {
    // Take one snapshot at boot so the page isn't all zeros immediately
    // after deploy. After that, every 5 min.
    setTimeout(() => void this.sample(persist), 1_000);
    this.samplerTimer = setInterval(
      () => void this.sample(persist),
      SAMPLE_INTERVAL_MS,
    );
  }

  // Exposed so tests / dev tools can force a sample synchronously.
  async sample(persist = true): Promise<void> {
    const now = new Date();
    for (const app of this.apps.listApps()) {
      const status = app.status;
      const prev = this.lastStatus.get(app.id);
      this.lastStatus.set(app.id, status);

      // Update ring buffer (in-memory snapshot).
      this.applySnapshot({
        serviceId: app.id,
        serviceName: app.name,
        status,
        score: scoreFromStatus(status),
        timestamp: now.toISOString(),
      });

      // Persist to JetStream.
      if (persist && this.eventBus) {
        await this.eventBus.emit<SnapshotEvent>(
          `nola.events.nola.health.snapshot.${app.id}`,
          {
            serviceId: app.id,
            serviceName: app.name,
            status,
            score: scoreFromStatus(status),
            timestamp: now.toISOString(),
          },
          'nola-hq',
        );
      }

      // Detect status transitions → emit incident events.
      if (prev !== undefined && prev !== status) {
        await this.handleTransition(app, prev, status, now, persist);
      } else if (prev === undefined && status !== 'online') {
        // First observation lands in a bad state — open an incident
        // immediately so the operator sees the issue.
        await this.handleTransition(app, 'online', status, now, persist);
      }
    }
  }

  /* ─── reads ──────────────────────────────────────────────── */

  findAll(): HealthRow[] {
    const apps = this.apps.listApps();
    // Force a fresh in-memory sample so the response reflects the
    // current registry status, even between scheduled ticks.
    const now = new Date();
    for (const a of apps) {
      this.applySnapshot({
        serviceId: a.id,
        serviceName: a.name,
        status: a.status,
        score: scoreFromStatus(a.status),
        timestamp: now.toISOString(),
      });
    }
    return apps.map((a) => this.toRow(a));
  }

  findOne(id: string): HealthRow {
    try {
      return this.toRow(this.apps.getApp(id));
    } catch {
      throw new NotFoundException(`Health ${id} introuvable`);
    }
  }

  overall(): {
    total: number;
    operational: number;
    degraded: number;
    down: number;
    avg_uptime: number;
    total_errors_24h: number;
    open_incidents: number;
  } {
    const rows = this.findAll();
    const operational = rows.filter((r) => r.status === 'operational').length;
    const degraded = rows.filter((r) => r.status === 'degraded').length;
    const down = rows.filter((r) => r.status === 'down').length;
    const avgUptime = rows.length
      ? rows.reduce((s, r) => s + r.uptime, 0) / rows.length
      : 0;
    return {
      total: rows.length,
      operational,
      degraded,
      down,
      avg_uptime: Number(avgUptime.toFixed(3)),
      total_errors_24h: rows.reduce((s, r) => s + r.errors24h, 0),
      open_incidents: this.openIncidents.size,
    };
  }

  listIncidents(opts: { limit?: number; open?: boolean } = {}): HealthIncident[] {
    const limit = Math.max(1, Math.min(opts.limit ?? 50, MAX_RECENT_INCIDENTS));
    const now = Date.now();
    const open = Array.from(this.openIncidents.values()).map((i) => ({
      ...i,
      durationMs: now - new Date(i.openedAt).getTime(),
    }));
    if (opts.open === true) return open.slice(0, limit);
    const merged = [...open, ...this.recentIncidents];
    merged.sort((a, b) => (b.openedAt > a.openedAt ? 1 : -1));
    return merged.slice(0, limit);
  }

  /* ─── projection ─────────────────────────────────────────── */

  private applySnapshot(s: SnapshotEvent): void {
    const ts = new Date(s.timestamp).getTime();
    if (Number.isNaN(ts)) return;
    const ring = this.rings.get(s.serviceId) ?? this.newRing(ts);
    this.advance(ring, ts);
    ring.series[ring.cursor] = Math.max(ring.series[ring.cursor], s.score);
    this.rings.set(s.serviceId, ring);
  }

  /**
   * Update the per-service metrics window. Two side-effects:
   *
   *  - `lastMetrics` is overwritten with the freshest snapshot — the
   *    Health page reads p50/p99 from here on every request.
   *  - The error count is added to the rolling 24h ring keyed by the
   *    snapshot's `windowEnd` hour, so `errors24h` is the sum of the
   *    last 24 hourly buckets even across restarts (consumer replays
   *    the stream on boot).
   */
  private applyMetrics(snap: MetricsSnapshotEvent): void {
    if (!snap.service) return;
    this.lastMetrics.set(snap.service, snap);
    const ts = new Date(snap.windowEnd).getTime();
    if (Number.isNaN(ts)) return;

    if (snap.errorCount > 0) {
      const ring =
        this.errorRings.get(snap.service) ?? this.newErrorRing(ts);
      this.advanceErrors(ring, ts);
      ring.buckets[ring.cursor] += snap.errorCount;
      this.errorRings.set(snap.service, ring);
    }

    // Latency history — keep worst-case p99 per hour so a single spike
    // remains visible 24h later instead of being averaged into oblivion.
    if (snap.p99Ms > 0) {
      const ring =
        this.latencyRings.get(snap.service) ?? this.newErrorRing(ts);
      this.advanceErrors(ring, ts);
      ring.buckets[ring.cursor] = Math.max(
        ring.buckets[ring.cursor],
        Math.round(snap.p99Ms),
      );
      this.latencyRings.set(snap.service, ring);
    }
  }

  private applyIncident(inc: HealthIncident): void {
    if (inc.state === 'open') {
      this.openIncidents.set(inc.serviceId, inc);
    } else {
      this.openIncidents.delete(inc.serviceId);
      // De-dupe by id when replaying — a closed event may arrive after
      // the open event during boot replay.
      if (!this.recentIncidents.find((i) => i.id === inc.id)) {
        this.recentIncidents.unshift(inc);
      } else {
        const idx = this.recentIncidents.findIndex((i) => i.id === inc.id);
        this.recentIncidents[idx] = inc;
      }
      if (this.recentIncidents.length > MAX_RECENT_INCIDENTS) {
        this.recentIncidents.length = MAX_RECENT_INCIDENTS;
      }
    }
  }

  private async handleTransition(
    app: AppProjection,
    prev: AppProjection['status'],
    next: AppProjection['status'],
    when: Date,
    persist: boolean,
  ): Promise<void> {
    const wasUp = prev === 'online';
    const isUp = next === 'online';
    if (wasUp === isUp) return;

    if (!isUp) {
      // online → degraded/offline → open incident. Registry status uses
      // "offline" (heartbeat lost); the public `HealthStatus` calls it
      // "down" — we map across here.
      const severity: HealthIncident['severity'] = next === 'offline' ? 'P2' : 'P3';
      const incident: HealthIncident = {
        id: `inc_${app.id}_${when.getTime()}`,
        serviceId: app.id,
        serviceName: app.name,
        severity,
        state: 'open',
        reason: next === 'offline' ? 'service offline (heartbeat lost)' : 'service degraded',
        openedAt: when.toISOString(),
        closedAt: null,
        durationMs: 0,
      };
      this.openIncidents.set(app.id, incident);
      this.logger.warn(
        `[INCIDENT OPEN] ${app.id} → ${next} · sev=${severity}`,
      );
      // Fire-and-forget — même contrat que côté tickets : l'alerte push
      // ne participe jamais au chemin critique de la projection santé.
      void this.push.broadcast({
        title: `Incident ${severity} · ${app.name}`,
        body: incident.reason,
        url: '/health',
        tag: `incident-${app.id}`,
      });
      if (persist && this.eventBus) {
        await this.eventBus.emit<HealthIncident>(
          `nola.events.nola.health.incident.${app.id}`,
          incident,
          'nola-hq',
        );
      }
    } else {
      // back to online → close any open incident.
      const open = this.openIncidents.get(app.id);
      if (!open) return;
      const closed: HealthIncident = {
        ...open,
        state: 'closed',
        closedAt: when.toISOString(),
        durationMs: when.getTime() - new Date(open.openedAt).getTime(),
      };
      this.openIncidents.delete(app.id);
      this.recentIncidents.unshift(closed);
      if (this.recentIncidents.length > MAX_RECENT_INCIDENTS) {
        this.recentIncidents.length = MAX_RECENT_INCIDENTS;
      }
      this.logger.log(
        `[INCIDENT CLOSE] ${app.id} · ${Math.round(closed.durationMs / 1000)}s`,
      );
      if (persist && this.eventBus) {
        await this.eventBus.emit<HealthIncident>(
          `nola.events.nola.health.incident.${app.id}`,
          closed,
          'nola-hq',
        );
      }
    }
  }

  /* ─── helpers ────────────────────────────────────────────── */

  private toRow(app: AppProjection): HealthRow {
    const ring = this.rings.get(app.id) ?? this.newRing(Date.now());
    const ordered: number[] = [];
    for (let i = 1; i <= BUCKETS_24H; i += 1) {
      ordered.push(ring.series[(ring.cursor + i) % BUCKETS_24H]);
    }
    const uptime =
      (ordered.reduce((s, v) => s + v, 0) / (ordered.length * 100)) * 100;
    const metrics = this.lastMetrics.get(app.id);
    const errorRing = this.errorRings.get(app.id);
    // Sum the rolling 24h error buckets — fall back to the last
    // window's count when we haven't accumulated history yet.
    const errors24h = errorRing
      ? errorRing.buckets.reduce((s, n) => s + n, 0)
      : (metrics?.errorCount ?? 0);

    const latencyRing = this.latencyRings.get(app.id);
    let p99Series: number[] | null = null;
    if (latencyRing) {
      p99Series = [];
      for (let i = 1; i <= BUCKETS_24H; i += 1) {
        p99Series.push(latencyRing.buckets[(latencyRing.cursor + i) % BUCKETS_24H]);
      }
    }

    return {
      id: app.id,
      name: app.name,
      kind: app.kind,
      httpReachable: app.httpReachable,
      uptime: Number(uptime.toFixed(2)),
      p50: metrics ? Math.round(metrics.p50Ms) : null,
      p99: metrics ? Math.round(metrics.p99Ms) : null,
      errors24h,
      status: statusFromRegistry(app.status),
      series: ordered,
      p99Series,
    };
  }

  private newErrorRing(nowMs: number): ErrorRing {
    return {
      bucketStartMs: Math.floor(nowMs / BUCKET_MS) * BUCKET_MS,
      cursor: 0,
      buckets: new Array(BUCKETS_24H).fill(0),
    };
  }

  private advanceErrors(ring: ErrorRing, nowMs: number): void {
    const currentBucketStart = Math.floor(nowMs / BUCKET_MS) * BUCKET_MS;
    let hours = Math.floor(
      (currentBucketStart - ring.bucketStartMs) / BUCKET_MS,
    );
    if (hours <= 0) return;
    if (hours > BUCKETS_24H) hours = BUCKETS_24H;
    for (let i = 0; i < hours; i += 1) {
      ring.cursor = (ring.cursor + 1) % BUCKETS_24H;
      ring.buckets[ring.cursor] = 0;
    }
    ring.bucketStartMs = currentBucketStart;
  }

  private newRing(nowMs: number): RingBuffer {
    return {
      bucketStartMs: Math.floor(nowMs / BUCKET_MS) * BUCKET_MS,
      cursor: 0,
      series: new Array(BUCKETS_24H).fill(100),
    };
  }

  private advance(ring: RingBuffer, nowMs: number): void {
    const currentBucketStart = Math.floor(nowMs / BUCKET_MS) * BUCKET_MS;
    let hoursAdvanced = Math.floor(
      (currentBucketStart - ring.bucketStartMs) / BUCKET_MS,
    );
    if (hoursAdvanced <= 0) return;
    if (hoursAdvanced > BUCKETS_24H) hoursAdvanced = BUCKETS_24H;
    for (let i = 0; i < hoursAdvanced; i += 1) {
      ring.cursor = (ring.cursor + 1) % BUCKETS_24H;
      ring.series[ring.cursor] = 0;
    }
    ring.bucketStartMs = currentBucketStart;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}

function scoreFromStatus(status: AppProjection['status']): number {
  if (status === 'online') return 100;
  if (status === 'degraded') return 50;
  return 0;
}

function statusFromRegistry(status: AppProjection['status']): HealthStatus {
  if (status === 'online') return 'operational';
  if (status === 'degraded') return 'degraded';
  return 'down';
}
