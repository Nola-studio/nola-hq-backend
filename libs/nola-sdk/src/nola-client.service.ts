import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  NolaClient,
  type NolaClientOptions,
  type RegistrationResult,
} from '@nola-studio/sdk';
import { NOLA_CONFIG, NolaConfig } from './nola.config';

// Phase 1 retry schedule. Total ≈ 22s before ready() unblocks even if
// every attempt fails — keeps Railway's 30s healthcheck window safe.
const PHASE1_BACKOFF_MS = [500, 2_000, 5_000, 15_000] as const;
// After the initial burst, keep trying once a minute in the background so
// a recovering Keycloak/NATS eventually flips the replica to ready without
// requiring a redeploy.
const BACKGROUND_RETRY_INTERVAL_MS = 60_000;

@Injectable()
export class NolaClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NolaClientService.name);
  private client: NolaClient | null = null;
  private registration: RegistrationResult | null = null;
  private bootstrapAttempts = 0;
  private lastBootstrapError: string | null = null;
  private backgroundTimer: NodeJS.Timeout | null = null;

  constructor(@Inject(NOLA_CONFIG) private readonly config: NolaConfig) {}

  /**
   * Bootstrap is started fire-and-forget. NestJS keeps booting (so HTTP
   * /health responds within ~1s), the announce + Keycloak provisioning
   * runs in the background. If callers (e.g. AuthService.silentLogin)
   * need the registration, they `await client.ready()`.
   *
   * Doing this synchronously blocked `app.listen()` long enough to fail
   * Railway's 30s healthcheck when NATS auth has issues.
   */
  private readyPromise: Promise<void> | null = null;

  onModuleInit(): void {
    if (this.config.offline) {
      this.logger.warn('NolaClient skipped — offline=true (no NATS connection)');
      this.readyPromise = Promise.resolve();
      return;
    }
    this.readyPromise = this.connectAsync();
    // swallow rejection — connectAsync already logs the failure
    this.readyPromise.catch(() => undefined);
  }

  /**
   * Two-phase startup when the app has BOTH dedicated NATS runtime creds
   * (pre-provisioned by the platform operator in nats-server.conf — e.g.
   * NATS_USER=kelasi) AND bootstrap creds (NOLA_BOOTSTRAP_USER):
   *
   *   Phase 1  Connect with bootstrap creds, send `nola.bootstrap.announce`,
   *            receive { bffClientId, bffClientSecret, authIssuer } in the
   *            RegistrationResult, then stop that client.
   *   Phase 2  Connect with the dedicated runtime creds for command/event
   *            traffic on `<account>.internal.>`. Phase-1 registration is
   *            kept in memory for AuthService.silentLogin.
   *
   * Single-credential flows still work:
   *   - bootstrap only       (no NATS_USER): one connection, runtime + reg
   *   - dedicated only       (no bootstrap): one connection, no OIDC creds
   */
  private async connectAsync(): Promise<void> {
    // Dedicated = has its own runtime creds (user/pass OR decentralized .creds)
    // → connect directly. natsCreds alone must count as dedicated so a
    // creds-only (post-cutover) config doesn't fall through to bootstrap.
    const hasDedicated = Boolean(
      (this.config.natsUser && this.config.natsPass) || this.config.natsCreds,
    );
    const hasBootstrap = Boolean(this.config.bootstrap);

    // ─── Phase 1 — bootstrap-only handshake (with retry) ─────────────
    // Keycloak/NATS can flake transiently right after a (re)deploy. We retry
    // a bounded burst on boot so ready() resolves with a usable registration
    // most of the time. If every burst attempt still fails, a slower
    // background loop (scheduleBackgroundRetry) keeps trying so a recovering
    // upstream eventually flips this replica from /health/ready=503 to 200
    // without requiring a redeploy.
    if (hasDedicated && hasBootstrap) {
      for (let i = 0; i < PHASE1_BACKOFF_MS.length; i++) {
        if (await this.attemptPhase1Bootstrap()) break;
        if (i < PHASE1_BACKOFF_MS.length - 1) {
          const delay = PHASE1_BACKOFF_MS[i];
          this.logger.warn(
            `Phase 1 bootstrap attempt ${this.bootstrapAttempts} did not yield a registration — ` +
              `retrying in ${delay}ms (last error: ${this.lastBootstrapError ?? 'none'})`,
          );
          await new Promise((r) => setTimeout(r, delay));
        }
      }
      if (!this.hasUsableRegistration()) {
        this.logger.error(
          `Phase 1 bootstrap exhausted ${this.bootstrapAttempts} attempts without a usable ` +
            `registration. Silent SSO will return ServiceUnavailable until background retry succeeds.`,
        );
        this.scheduleBackgroundRetry();
      }
    }

    // ─── Phase 2 — runtime connection ────────────────────────────────
    const options: NolaClientOptions = {
      serviceName: this.config.serviceName,
      serviceVersion: this.config.serviceVersion,
      kind: this.config.kind,
      natsUrl: this.config.natsUrl,
      // Decentralized auth + TLS (Phase 3 prep, additive/dormant until set).
      natsCreds: this.config.natsCreds,
      natsTlsCa: this.config.natsTlsCa,
      natsTlsCert: this.config.natsTlsCert,
      natsTlsKey: this.config.natsTlsKey,
      // Always carry the manifest into the runtime client — the registry
      // projection on the HQ side wants it on every `register` event,
      // and after Phase-1 the SDK drops the bootstrap block so the
      // manifest needs its own top-level slot.
      manifest: this.config.bootstrap?.manifest,
    };

    if (hasDedicated) {
      // natsCreds (decentralized) already set on `options` and wins in the SDK;
      // only carry user/pass when actually present (legacy path).
      if (this.config.natsUser && this.config.natsPass) {
        options.natsUser = this.config.natsUser;
        options.natsPass = this.config.natsPass;
      }
      const how = this.config.natsCreds ? 'creds (JWT/NKey)' : `user="${this.config.natsUser}"`;
      this.logger.log(`Runtime (Phase 2) connecting via ${how} @ ${this.config.natsUrl}`);
    } else if (hasBootstrap) {
      // No dedicated creds — fall back to bootstrap creds for everything
      // (legacy single-phase path).
      options.bootstrap = this.config.bootstrap;
      this.logger.log(
        `Single-phase boot+runtime with realm "${this.config.bootstrap!.realm}" via ${this.config.natsUrl}`,
      );
    }

    const client = new NolaClient(options);
    try {
      await client.start();
      this.client = client;
      // Single-phase flow: keep whatever the runtime client returned.
      // Two-phase flow: prefer Phase-1 registration, falling back to runtime if
      // Phase 1 didn't yield one for any reason.
      if (!this.registration) {
        this.registration = client.registrationResult;
      }
      if (this.registration) {
        this.logger.log(
          `NolaClient ready (registration status=${this.registration.status})`,
        );
      } else {
        this.logger.log('NolaClient connected to NATS (no registration)');
      }
    } catch (err) {
      const salvaged = client.registrationResult ?? null;
      if (salvaged?.bffClientId && salvaged?.authIssuer && !this.registration) {
        this.registration = salvaged;
        this.logger.warn(
          `Runtime NATS connect failed (${err instanceof Error ? err.message : String(err)}) — ` +
            `but registration was provisioned. Silent SSO + JWT verify remain available; ` +
            `command bus & event bus disabled until NATS perms are fixed.`,
        );
      } else if (this.registration) {
        this.logger.warn(
          `Runtime NATS connect failed (${err instanceof Error ? err.message : String(err)}) — ` +
            `Phase-1 registration kept in memory; silent SSO available, command bus disabled.`,
        );
      } else {
        this.logger.error(
          `NolaClient failed to start — degraded mode (manifest & /health remain available): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  /**
   * Resolves once the bootstrap attempt has finished (success or salvage).
   * Use from request handlers that need the registration result.
   */
  async ready(): Promise<void> {
    if (this.readyPromise) await this.readyPromise.catch(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.backgroundTimer) {
      clearInterval(this.backgroundTimer);
      this.backgroundTimer = null;
    }
    if (this.client) {
      await this.client.stop().catch((err) => {
        this.logger.warn(`NolaClient.stop() error: ${err}`);
      });
      this.client = null;
    }
  }

  /**
   * Run one Phase-1 bootstrap announce. Returns true when a usable
   * registration (bffClientId + bffClientSecret + authIssuer) is in memory.
   * Idempotent — safe to retry; nola-auth deduplicates by realm name.
   */
  private async attemptPhase1Bootstrap(): Promise<boolean> {
    this.bootstrapAttempts++;
    const bootstrapClient = new NolaClient({
      serviceName: this.config.serviceName,
      serviceVersion: this.config.serviceVersion,
      natsUrl: this.config.natsUrl,
      bootstrap: this.config.bootstrap,
      // kind forwarding: see TODO in connectAsync().
      // Post-cutover: announce over HQ's OWN dedicated creds (its account
      // imports nola.bootstrap.announce), so no shared bootstrap password is
      // needed. Pre-cutover these are undefined and the SDK falls back to the
      // shared bootstrap user/pass. TLS flows through the same options.
      natsCreds: this.config.natsCreds,
      natsTlsCa: this.config.natsTlsCa,
      natsTlsCert: this.config.natsTlsCert,
      natsTlsKey: this.config.natsTlsKey,
    });
    this.logger.log(
      `Bootstrap (Phase 1) attempt #${this.bootstrapAttempts} with realm ` +
        `"${this.config.bootstrap!.realm}" using ${
          this.config.natsCreds ? 'dedicated creds' : 'shared bootstrap creds'
        }`,
    );
    try {
      await bootstrapClient.start();
    } catch (err) {
      // With shared bootstrap creds the SDK's tail connectDirect() throws (no
      // nola.> publish perm) — expected; the announce still populated the
      // registration. With dedicated creds that tail succeeds. Either way, real
      // errors (NATS auth, Keycloak admin auth) leave registrationResult empty.
      this.lastBootstrapError = err instanceof Error ? err.message : String(err);
    }
    const reg = bootstrapClient.registrationResult ?? null;
    if (reg) this.registration = reg;
    await bootstrapClient.stop().catch(() => undefined);

    if (this.hasUsableRegistration()) {
      this.logger.log(
        `Bootstrap registered (status=${this.registration!.status}, ` +
          `bffClientId=${this.registration!.bffClientId}, ` +
          `authIssuer=${this.registration!.authIssuer})`,
      );
      this.lastBootstrapError = null;
      if (this.backgroundTimer) {
        clearInterval(this.backgroundTimer);
        this.backgroundTimer = null;
      }
      return true;
    }
    return false;
  }

  private hasUsableRegistration(): boolean {
    return Boolean(
      this.registration?.bffClientId &&
        this.registration?.bffClientSecret &&
        this.registration?.authIssuer,
    );
  }

  /**
   * Once the boot-time burst is exhausted, keep trying every minute so a
   * recovering Keycloak/NATS eventually flips this replica to ready.
   */
  private scheduleBackgroundRetry(): void {
    if (this.backgroundTimer) return;
    this.backgroundTimer = setInterval(() => {
      void this.attemptPhase1Bootstrap().catch(() => undefined);
    }, BACKGROUND_RETRY_INTERVAL_MS);
    // unref so the timer doesn't hold the process open during shutdown
    this.backgroundTimer.unref?.();
  }

  /**
   * Returns the active client. Throws if Nola Core integration is offline —
   * callers must handle the case (e.g. `JwtAuthGuard` rejects requests when
   * auth bootstrap hasn't completed).
   */
  getClient(): NolaClient {
    if (!this.client) {
      throw new Error('NolaClient not started (offline mode or bootstrap failed)');
    }
    return this.client;
  }

  isReady(): boolean {
    return this.client !== null;
  }

  getRegistration(): RegistrationResult | null {
    return this.registration;
  }

  /**
   * Public escape hatch for the gateway's admin "re-bootstrap" endpoint.
   * Runs a single fresh Phase-1 attempt without waiting for the 60s
   * background timer. Returns a structured result so the caller can show
   * "registered as <bffClientId>" or "still failing — last error: <…>".
   *
   * Idempotent. If Phase 1 succeeds, cancels any pending background timer
   * (the bootstrap-burst already does this internally on success).
   */
  async forceBootstrap(): Promise<{
    success: boolean;
    attempts: number;
    registration: { bffClientId: string; status: string; authIssuer: string } | null;
    lastError: string | null;
  }> {
    const had = this.hasUsableRegistration();
    const ok = await this.attemptPhase1Bootstrap();
    return {
      success: ok && this.hasUsableRegistration(),
      attempts: this.bootstrapAttempts,
      registration:
        this.registration && this.hasUsableRegistration()
          ? {
              bffClientId: this.registration.bffClientId!,
              status: this.registration.status,
              authIssuer: this.registration.authIssuer!,
            }
          : null,
      // If we already had a good registration and the new attempt didn't
      // produce one, that's fine — the old one is still in memory.
      lastError: ok || had ? null : this.lastBootstrapError,
    };
  }

  /**
   * Sanitized snapshot for the admin /auth/status diagnostic endpoint.
   * Never leaks the bffClientSecret — only metadata the operator needs
   * to confirm whether the gateway can serve /auth/login.
   */
  getStatus(): {
    ready: boolean;
    bootstrapAttempts: number;
    registration: { bffClientId: string; status: string; authIssuer: string } | null;
    lastError: string | null;
    backgroundRetryActive: boolean;
  } {
    const ready = this.hasUsableRegistration();
    return {
      ready,
      bootstrapAttempts: this.bootstrapAttempts,
      registration:
        ready && this.registration
          ? {
              bffClientId: this.registration.bffClientId!,
              status: this.registration.status,
              authIssuer: this.registration.authIssuer!,
            }
          : null,
      lastError: ready ? null : this.lastBootstrapError,
      backgroundRetryActive: this.backgroundTimer !== null,
    };
  }
}
