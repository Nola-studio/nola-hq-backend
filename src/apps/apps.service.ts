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
  return KNOWN_SERVICE_IDS.has(id) ? 'service' : 'app';
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

@Injectable()
export class AppsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AppsService.name);
  private readonly apps = new Map<string, AppProjection>();
  private readonly manifestHistory = new Map<string, ManifestVersion[]>();
  private eventBus: EventBus | null = null;
  private stalenessTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly nolaClient: NolaClientService) {}

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
    const displayName =
      ((data.display as Record<string, unknown> | undefined)?.name as string) ??
      id;

    this.apps.set(id, {
      id,
      kind: inferKind(id, data),
      name: displayName,
      version,
      status: 'online',
      lastHeartbeat: now,
      manifest: data,
      registeredAt: now,
    });

    const history = this.manifestHistory.get(id) ?? [];
    const last = history[history.length - 1]?.version;
    if (last !== version) {
      history.push({ version, manifest: data, registeredAt: now });
      if (history.length > MAX_MANIFEST_HISTORY) history.shift();
      this.manifestHistory.set(id, history);
    }
    this.logger.log(
      `Registered "${id}" v${version} (${history.length} manifest version(s))`,
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
      if (age > STALENESS_OFFLINE_MS) app.status = 'offline';
      else if (age > STALENESS_DEGRADED_MS) app.status = 'degraded';
    }
  }
}
