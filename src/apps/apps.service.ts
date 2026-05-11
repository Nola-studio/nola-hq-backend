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
export interface AppProjection {
  id: string;
  name: string;
  version: string;
  status: 'online' | 'degraded' | 'offline';
  lastHeartbeat: string;
  manifest?: Record<string, unknown>;
  registeredAt: string;
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

  async onModuleInit() {
    try {
      await this.nolaClient.ready();
      if (!this.nolaClient.isReady()) {
        this.logger.warn(
          'NolaClient pas prêt — registry projection désactivée jusqu\'à connexion NATS.',
        );
        return;
      }
      this.eventBus = new EventBus(this.nolaClient.getClient());
      await this.eventBus.init();

      await this.eventBus.ensureStream({
        name: STREAM_NAME,
        subjects: STREAM_SUBJECTS,
        max_age: STREAM_MAX_AGE_NS,
      });

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
    } catch (err) {
      this.logger.error(
        `Failed to start registry projection: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  onModuleDestroy() {
    if (this.stalenessTimer) clearInterval(this.stalenessTimer);
  }

  // ── Read API ──────────────────────────────────────────

  listApps(): AppProjection[] {
    return [...this.apps.values()];
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
