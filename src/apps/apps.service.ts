import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EventBus } from '@nola-studio/sdk';
import { NolaClientService } from '@nola-hq/nola-sdk';

/**
 * Projection en mémoire des apps présentes sur le bus.
 *
 * Pattern copié de `nola-platform/services/nola-studio/server/src/registry/
 * registry.service.ts` — la source de vérité c'est JetStream (stream
 * `NOLA_REGISTRY`, rétention 24h). La projection se reconstruit au boot
 * en consommant ce stream.
 *
 * Pas de persistance Postgres pour le registry — le HQ s'aligne sur le
 * studio : un redémarrage = rejeu des 24h via JetStream.
 */
export type AppKind = 'app' | 'service';

export interface AppProjection {
  id: string;
  /** Topology kind — distinguishes customer-facing SaaS apps from platform-internal services. */
  kind: AppKind;
  name: string;
  version: string;
  status: 'online' | 'degraded' | 'offline';
  lastHeartbeat: string;
  manifest?: Record<string, unknown>;
  registeredAt: string;
  /**
   * Result of the last HTTP liveness probe (independent of the NATS
   * heartbeat). `true` = the service answered its HTTP health endpoint,
   * `false` = it didn't, `null` = never probed (no URL configured). Used
   * to reconcile "heartbeat lost on the bus" against "process actually
   * up" — a service that lost its NATS connection but still serves HTTP
   * is `degraded`, not `offline`.
   */
  httpReachable: boolean | null;
  /** ISO timestamp of the last HTTP probe, or null if never probed. */
  lastHttpCheck: string | null;
}

/**
 * Hardcoded fallback classification for ids whose register payload doesn't
 * carry `kind` yet (current @nola-studio/sdk 0.3.5 doesn't forward it). Once
 * the SDK ships with `kind` support, the register payload becomes the source
 * of truth and this list is only a backstop for stragglers.
 */
const KNOWN_SERVICE_IDS = new Set<string>([
  'nola-auth',
  'nola-billing',
  'nola-notify',
  'nola-gateway',
  'nola-studio',
  'nola-hq',
]);

function inferKind(id: string, payload: Record<string, unknown>): AppKind {
  const declared = payload.kind;
  if (declared === 'app' || declared === 'service') return declared;
  const manifestKind = (payload.manifest as { kind?: unknown } | undefined)
    ?.kind;
  if (manifestKind === 'app' || manifestKind === 'service') return manifestKind;
  // Naming convention: every platform-internal service is published under a
  // `nola-` id (nola-auth, nola-billing, …). Customer-facing app backends
  // (kelasi, kriver, …) never carry that prefix. The KNOWN_SERVICE_IDS set
  // stays as an explicit allowlist for any internal service that might one
  // day break the convention.
  return id.startsWith('nola-') || KNOWN_SERVICE_IDS.has(id)
    ? 'service'
    : 'app';
}

export interface ManifestVersion {
  version: string;
  manifest: Record<string, unknown>;
  registeredAt: string;
}

const MAX_MANIFEST_HISTORY = 10;
const STREAM_NAME = 'NOLA_REGISTRY';
const STREAM_SUBJECTS = ['nola.registry.>'];
const STREAM_MAX_AGE_NS = 24 * 60 * 60 * 1_000_000_000; // 24h
const CONSUMER_NAME = 'nola-hq-registry-projection';
const STALENESS_DEGRADED_MS = 90_000;
const STALENESS_OFFLINE_MS = 180_000;
const STALENESS_CHECK_MS = 60_000;
const HTTP_PROBE_INTERVAL_MS = 60_000;
const HTTP_PROBE_TIMEOUT_MS = 5_000;
/** Default health path used when a service's manifest doesn't declare one. */
const DEFAULT_HEALTH_PATH = '/health';

/**
 * Parse the `HEALTH_PROBE_URLS` env var — a JSON object mapping a service
 * id to its reachable base URL, e.g.
 *
 *   HEALTH_PROBE_URLS={"kelasi":"https://api.kelasi.app","nola-auth":"http://nola-auth.railway.internal:3000"}
 *
 * Returns an empty map (probing disabled) when unset or malformed, so the
 * registry keeps behaving exactly as before unless an operator opts in.
 */
function parseProbeUrls(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw?.trim()) return map;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    for (const [id, url] of Object.entries(obj)) {
      if (typeof url === 'string' && url.trim()) {
        map.set(id, url.trim().replace(/\/$/, ''));
      }
    }
  } catch {
    // Malformed config — fall back to heartbeat-only (logged at init).
  }
  return map;
}

@Injectable()
export class AppsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AppsService.name);
  private readonly apps = new Map<string, AppProjection>();
  private readonly manifestHistory = new Map<string, ManifestVersion[]>();
  private eventBus: EventBus | null = null;
  private stalenessTimer: ReturnType<typeof setInterval> | null = null;
  private httpProbeTimer: ReturnType<typeof setInterval> | null = null;
  private readonly probeUrls = parseProbeUrls(process.env.HEALTH_PROBE_URLS);

  constructor(private readonly nolaClient: NolaClientService) {
    if (this.probeUrls.size > 0) {
      this.logger.log(
        `HTTP liveness probe enabled for ${this.probeUrls.size} service(s): ${[...this.probeUrls.keys()].join(', ')}`,
      );
    } else if (process.env.HEALTH_PROBE_URLS?.trim()) {
      this.logger.warn(
        'HEALTH_PROBE_URLS is set but parsed to zero entries — check it is valid JSON. HTTP probing disabled.',
      );
    }
  }

  onModuleInit() {
    // Fire-and-forget : on attend en arrière-plan que NolaClient ait
    // terminé son bootstrap NATS (qui se passe en parallèle), puis on
    // installe la projection. Bloquer ici retarderait `app.listen()` et
    // ferait échouer le healthcheck Railway de 30s.
    void this.startProjection();
  }

  private async startProjection() {
    // NolaClient bootstrap = fire-and-forget côté SDK : `ready()` peut
    // résoudre avant que `isReady()` ne soit vrai. On poll jusqu'à 30
    // tentatives (~2 min) pour laisser le temps au phase-1 retry de
    // converger en cas de NATS / Keycloak qui mettent du temps.
    const maxAttempts = 30;
    let attempt = 0;
    while (!this.nolaClient.isReady() && attempt < maxAttempts) {
      await this.sleep(4_000);
      attempt += 1;
    }
    if (!this.nolaClient.isReady()) {
      this.logger.warn(
        `NolaClient pas prêt après ${attempt} tentatives — registry projection désactivée jusqu'à reconnexion.`,
      );
      return;
    }

    try {
      this.eventBus = new EventBus(this.nolaClient.getClient());
      await this.eventBus.init();

      await this.eventBus.ensureStream({
        name: STREAM_NAME,
        subjects: STREAM_SUBJECTS,
        max_age: STREAM_MAX_AGE_NS,
      });

      // Le SDK crée un consumer durable la 1re fois et le réutilise — donc
      // après un redémarrage du HQ, la projection est vide parce que le
      // consumer reprend là où il en était (rien de neuf à livrer). On le
      // supprime avant chaque boot pour qu'`consume()` le recrée avec
      // `deliver_policy: All` et rejoue le buffer 24h.
      try {
        const nc = this.nolaClient.getClient().getConnection();
        const jsm = await nc.jetstreamManager();
        await jsm.consumers.delete(STREAM_NAME, CONSUMER_NAME);
        this.logger.log(
          `Cleared previous durable consumer ${CONSUMER_NAME} — forcing full JetStream replay`,
        );
      } catch (err) {
        // Première fois ou consumer absent — c'est OK.
        this.logger.debug(
          `Consumer ${CONSUMER_NAME} not present (ok on first boot): ${
            err instanceof Error ? err.message : err
          }`,
        );
      }

      await this.eventBus.consume(
        STREAM_NAME,
        CONSUMER_NAME,
        'nola.registry.>',
        async (envelope) => {
          const event = (envelope as { event: string }).event;
          const payload = (envelope as { payload: Record<string, unknown> })
            .payload;
          if (event.endsWith('.register')) this.handleRegister(payload);
          else if (event.endsWith('.heartbeat')) this.handleHeartbeat(payload);
          else if (event.endsWith('.deregister'))
            this.handleDeregister(payload);
        },
      );

      this.stalenessTimer = setInterval(
        () => this.checkStaleness(),
        STALENESS_CHECK_MS,
      );

      if (this.probeUrls.size > 0) {
        // Run one probe shortly after boot, then on a fixed interval.
        setTimeout(() => void this.probeAll(), 2_000);
        this.httpProbeTimer = setInterval(
          () => void this.probeAll(),
          HTTP_PROBE_INTERVAL_MS,
        );
      }

      this.logger.log(
        `Registry projection started (stream=${STREAM_NAME}, consumer=${CONSUMER_NAME})`,
      );

      // Ask every connected SDK client to re-announce itself. The stream's
      // 24h retention means original register events for long-running apps
      // have already aged out — without this broadcast a brand-new nola-hq
      // boot would only ever see heartbeats (name + timestamp), never the
      // full manifest. Each NolaClient subscribes to `nola.registry.discover`
      // and re-publishes its `register` event with the manifest attached.
      //
      // Small delay before publishing so the consumer above is fully bound
      // and will catch the responses landing in the stream a few ms later.
      setTimeout(() => {
        void this.broadcastDiscover();
      }, 500);
    } catch (err) {
      this.logger.error(
        `Failed to start registry projection: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Fire-and-forget broadcast on `nola.registry.discover`. Each connected
   * NolaClient SDK responds by re-publishing its `nola.registry.register`
   * event (carrying the manifest). The JetStream subscription installed
   * just above captures those re-announces and feeds them into the
   * in-memory projection like any other register event.
   *
   * Safe to call on every boot — apps treat the message as a hint, not a
   * command; a noop on the client side just means we lose this round.
   */
  private async broadcastDiscover(): Promise<void> {
    if (!this.nolaClient.isReady()) return;
    try {
      await this.nolaClient.getClient().publish('nola.registry.discover', {
        requestedBy: 'nola-hq',
        timestamp: new Date().toISOString(),
      });
      this.logger.log('Broadcast nola.registry.discover — waiting for app re-announces');
    } catch (err) {
      this.logger.warn(
        `Failed to broadcast discover: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  onModuleDestroy() {
    if (this.stalenessTimer) clearInterval(this.stalenessTimer);
    if (this.httpProbeTimer) clearInterval(this.httpProbeTimer);
  }

  /**
   * Probe every service that has a configured base URL by GET-ing its HTTP
   * health endpoint. Records the result on the projection and softens a
   * heartbeat-driven `offline` to `degraded` when the process actually
   * answers — this is what reconciles "down on the bus" against "up in the
   * infrastructure". A live heartbeat is still authoritative for `online`;
   * the probe never downgrades a service that is heartbeating.
   */
  private async probeAll(): Promise<void> {
    const targets = [...this.apps.values()].filter((a) =>
      this.probeUrls.has(a.id),
    );
    await Promise.all(targets.map((app) => this.probeOne(app)));
  }

  private async probeOne(app: AppProjection): Promise<void> {
    const base = this.probeUrls.get(app.id);
    if (!base) return;
    const endpoints = (app.manifest as { endpoints?: Record<string, unknown> } | undefined)
      ?.endpoints;
    const path =
      (typeof endpoints?.health === 'string' && endpoints.health) ||
      DEFAULT_HEALTH_PATH;
    const url = `${base}${path.startsWith('/') ? '' : '/'}${path}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_PROBE_TIMEOUT_MS);
    let ok = false;
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'user-agent': 'nola-hq-health-probe' },
      });
      ok = res.ok; // 2xx/3xx → reachable
    } catch {
      ok = false; // network error / timeout / DNS → unreachable
    } finally {
      clearTimeout(timer);
    }

    app.httpReachable = ok;
    app.lastHttpCheck = new Date().toISOString();

    // Soften a heartbeat-driven offline when HTTP confirms the process is
    // alive. We never touch `online` (the bus already proved liveness) and
    // never force offline from here (a probe failing from nola-hq's vantage
    // point isn't proof the service is down for users).
    if (ok && app.status === 'offline') {
      app.status = 'degraded';
      this.logger.log(
        `"${app.id}" heartbeat lost but HTTP healthy — softened offline → degraded`,
      );
    }
  }

  // ── Read API ──────────────────────────────────────────

  listApps(kind?: AppKind): AppProjection[] {
    const all = [...this.apps.values()];
    return kind ? all.filter((a) => a.kind === kind) : all;
  }

  getApp(id: string): AppProjection {
    const a = this.apps.get(id);
    if (!a) {
      throw new NotFoundException(
        `App "${id}" introuvable dans le registry`,
      );
    }
    return a;
  }

  listManifestHistory(id: string): ManifestVersion[] {
    return [...(this.manifestHistory.get(id) ?? [])].reverse();
  }

  /**
   * Récupère un admin_action déclaré dans le manifeste. `null` si l'app
   * est inconnue ou si l'action n'est pas dans son manifeste.
   */
  getAdminAction(
    appId: string,
    actionId: string,
  ): Record<string, unknown> | null {
    const app = this.apps.get(appId);
    if (!app?.manifest) return null;
    const actions = (app.manifest as { admin_actions?: unknown }).admin_actions;
    if (!Array.isArray(actions)) return null;
    return (
      (actions as Record<string, unknown>[]).find((a) => a.id === actionId) ??
      null
    );
  }

  // ── Internals ─────────────────────────────────────────

  private handleRegister(data: Record<string, unknown>) {
    const id = (data.name as string) ?? '';
    if (!id) return;
    const now = new Date().toISOString();
    const version = (data.version as string) ?? '0.0.0';
    // SDK 0.5+ ships the manifest as a nested field. Older SDK versions
    // and platform services without a manifest send no `manifest` key —
    // we tolerate both by falling back to the outer payload (which still
    // exposes display / kind at the top level for legacy clients).
    const innerManifest =
      (data.manifest as Record<string, unknown> | undefined) ?? undefined;
    const displayName =
      ((innerManifest?.display as Record<string, unknown> | undefined)?.name as string) ??
      ((data.display as Record<string, unknown> | undefined)?.name as string) ??
      id;

    const prev = this.apps.get(id);
    this.apps.set(id, {
      id,
      kind: inferKind(id, data),
      name: displayName,
      version,
      status: 'online',
      lastHeartbeat: now,
      manifest: innerManifest,
      registeredAt: now,
      // Carry the last probe result across re-registers so a re-announce
      // doesn't wipe HTTP state until the next probe runs.
      httpReachable: prev?.httpReachable ?? null,
      lastHttpCheck: prev?.lastHttpCheck ?? null,
    });

    const history = this.manifestHistory.get(id) ?? [];
    const last = history[history.length - 1]?.version;
    if (last !== version && innerManifest) {
      history.push({ version, manifest: innerManifest, registeredAt: now });
      if (history.length > MAX_MANIFEST_HISTORY) history.shift();
      this.manifestHistory.set(id, history);
    }
    this.logger.log(
      `Registered "${id}" v${version} (manifest ${innerManifest ? 'present' : 'absent'})`,
    );
  }

  private handleHeartbeat(data: Record<string, unknown>) {
    const id = data.name as string;
    if (!id) return;
    const existing = this.apps.get(id);
    if (!existing) return;
    existing.lastHeartbeat =
      (data.timestamp as string) ?? new Date().toISOString();
    existing.status = 'online';
  }

  private handleDeregister(data: Record<string, unknown>) {
    const id = data.name as string;
    if (!id) return;
    const existing = this.apps.get(id);
    if (!existing) return;
    existing.status = 'offline';
    this.logger.log(`Deregistered "${id}"`);
  }

  private checkStaleness() {
    const now = Date.now();
    for (const app of this.apps.values()) {
      if (app.status === 'offline') continue;
      const age = now - new Date(app.lastHeartbeat).getTime();
      if (age > STALENESS_OFFLINE_MS) {
        // Heartbeat lost. If the last HTTP probe says the process still
        // answers, it's degraded (off the bus) rather than fully down.
        app.status = app.httpReachable === true ? 'degraded' : 'offline';
      } else if (age > STALENESS_DEGRADED_MS) {
        app.status = 'degraded';
      }
    }
  }
}
