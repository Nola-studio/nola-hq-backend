"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsRecorder = exports.NolaClient = void 0;
exports.createMetricsMiddleware = createMetricsMiddleware;
const nats_1 = require("nats");
class NolaClient {
    nc = null;
    heartbeatInterval = null;
    sc = (0, nats_1.StringCodec)();
    jc = (0, nats_1.JSONCodec)();
    options;
    _registrationResult = null;
    metricsRecorder = null;
    constructor(options) {
        this.options = options;
    }
    /** Service name used by this client — exposed so middleware factories
     *  can publish on the right subject without poking at private state. */
    get serviceName() {
        return this.options.serviceName;
    }
    /**
     * Lazily-created metrics recorder. Returns the same instance across
     * calls. The recorder schedules its own flush loop the first time
     * it's instantiated, so just calling this getter from a middleware
     * is enough to start emitting.
     */
    getMetrics() {
        if (!this.metricsRecorder) {
            this.metricsRecorder = new MetricsRecorder(this);
            this.metricsRecorder.start();
        }
        return this.metricsRecorder;
    }
    /** Connect to NATS and start heartbeat. If bootstrap config is provided, auto-registers first. */
    async start() {
        if (this.options.bootstrap) {
            await this.bootstrapAndRegister();
        }
        else {
            await this.connectDirect();
        }
    }
    /** Get the registration result (available after start() with bootstrap config) */
    get registrationResult() {
        return this._registrationResult;
    }
    /** Get the underlying NATS connection */
    getConnection() {
        if (!this.nc) {
            throw new Error('[NolaSDK] Not connected. Call start() first.');
        }
        return this.nc;
    }
    /** Publish a JSON message to a NATS subject */
    async publish(subject, data) {
        const nc = this.getConnection();
        nc.publish(subject, this.jc.encode(data));
    }
    /** Send a request and wait for a reply */
    async request(subject, data, timeoutMs = 5000) {
        const nc = this.getConnection();
        const msg = await nc.request(subject, this.jc.encode(data), { timeout: timeoutMs });
        return this.jc.decode(msg.data);
    }
    /** Subscribe to a NATS subject */
    async subscribe(subject, handler) {
        const nc = this.getConnection();
        const sub = nc.subscribe(subject);
        (async () => {
            for await (const msg of sub) {
                try {
                    const data = this.jc.decode(msg.data);
                    handler(data, msg.subject);
                }
                catch (err) {
                    console.error(`[NolaSDK] Error handling message on ${msg.subject}:`, err);
                }
            }
        })();
    }
    /** Gracefully disconnect */
    async stop() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        if (this.nc) {
            await this.nc.drain();
            console.log(`[NolaSDK] Disconnected "${this.options.serviceName}"`);
        }
    }
    // ─── Private: Direct Connection ─────────────────────────
    /**
     * TLS (private CA) + hardened reconnection profile shared by every
     * connect() in the SDK. The reconnection profile mirrors the kelasi
     * services (never give up + jittered backoff + a short ping so a
     * half-open socket after a NATS restart is detected in ~40s instead of
     * the ~4-6 min the nats.js default leaves it a zombie).
     */
    connectionDefaults() {
        const ca = this.options.natsTlsCa;
        const cert = this.options.natsTlsCert;
        const key = this.options.natsTlsKey;
        return {
            ...(ca ? { tls: { ca, ...(cert ? { cert } : {}), ...(key ? { key } : {}) } } : {}),
            reconnect: true,
            maxReconnectAttempts: -1,
            reconnectTimeWait: 2_000,
            reconnectJitter: 1_000,
            pingInterval: 20_000,
            maxPingOut: 2,
        };
    }
    /** Auth block: creds-based (decentralized) when provided, else user/pass. */
    authOptions() {
        return this.options.natsCreds
            ? { authenticator: (0, nats_1.credsAuthenticator)(new TextEncoder().encode(this.options.natsCreds)) }
            : { user: this.options.natsUser, pass: this.options.natsPass };
    }
    async connectDirect() {
        this.nc = await (0, nats_1.connect)({
            servers: this.options.natsUrl,
            ...this.authOptions(),
            ...this.connectionDefaults(),
            name: this.options.serviceName,
        });
        console.log(`[NolaSDK] Connected to NATS as "${this.options.serviceName}"`);
        await this.registerService();
        this.startHeartbeat();
        this.listenForDiscover();
    }
    // ─── Private: Bootstrap Registration Flow ───────────────
    async bootstrapAndRegister() {
        const bootstrap = this.options.bootstrap;
        const realm = bootstrap.realm ?? this.options.serviceName;
        const timeoutMs = bootstrap.timeoutMs ?? 15_000;
        // Step 1: Connect for the announce.
        //
        // Auth: prefer the app's *dedicated* creds (JWT/NKey) when provided. After
        // the decentralized-auth cutover the shared password bootstrap account is
        // retired — but every app account imports the `nola.bootstrap.announce`
        // service, so it can announce over its own identity with no shared secret.
        // When no dedicated creds are set (pre-cutover), fall back to the legacy
        // shared bootstrap user/pass. TLS + reconnection come from connectionDefaults().
        const usingDedicated = Boolean(this.options.natsCreds);
        console.log(`[NolaSDK] Connecting for registration announce (${usingDedicated ? 'dedicated creds' : 'shared bootstrap account'})...`);
        const bootstrapNc = await (0, nats_1.connect)({
            servers: this.options.natsUrl,
            ...(usingDedicated
                ? this.authOptions()
                : { user: bootstrap.bootstrapUser, pass: bootstrap.bootstrapPass }),
            ...this.connectionDefaults(),
            name: `${this.options.serviceName}-bootstrap`,
        });
        console.log(`[NolaSDK] Bootstrap connected — sending announce for "${this.options.serviceName}"`);
        // Step 2: Send announce request-reply
        const announcePayload = {
            id: this.options.serviceName,
            version: this.options.serviceVersion,
            realm,
            displayName: bootstrap.displayName,
            bootstrapSecret: bootstrap.bootstrapSecret,
            consumes: bootstrap.consumes ?? [],
            emits: bootstrap.emits ?? [],
            manifest: bootstrap.manifest,
            userClaims: bootstrap.userClaims,
        };
        try {
            const reply = await bootstrapNc.request('nola.bootstrap.announce', this.jc.encode(announcePayload), { timeout: timeoutMs });
            const raw = new TextDecoder().decode(reply.data);
            console.log(`[NolaSDK] Raw announce reply (${reply.data.length} bytes): ${raw}`);
            const response = this.jc.decode(reply.data);
            console.log(`[NolaSDK] Decoded response keys: ${Object.keys(response ?? {}).join(', ')}`);
            if (response.status === 'error') {
                await bootstrapNc.drain();
                throw new Error(`[NolaSDK] Registration rejected: ${response.error}`);
            }
            this._registrationResult = {
                status: response.status,
                natsUser: response.natsUser,
                natsPass: response.natsPass,
                bffClientId: response.bffClientId,
                bffClientSecret: response.bffClientSecret,
                publicClientId: response.publicClientId,
                authIssuer: response.authIssuer,
            };
            console.log(`[NolaSDK] Registration ${response.status} for "${this.options.serviceName}"`);
            // Step 3: Disconnect bootstrap
            await bootstrapNc.drain();
            // Step 4: Reconnect with dedicated credentials (if provisioned)
            if (response.status === 'provisioned' && response.natsUser && response.natsPass) {
                this.options.natsUser = response.natsUser;
                this.options.natsPass = response.natsPass;
                console.log(`[NolaSDK] Reconnecting with dedicated account "${response.natsUser}"...`);
            }
            // If already_exists, use whatever credentials were provided in options
            await this.connectDirect();
        }
        catch (err) {
            await bootstrapNc.drain().catch(() => { });
            // If announce fails (e.g. nola-auth not running), fall back to direct connection
            if (this.options.natsUser && this.options.natsPass) {
                console.warn(`[NolaSDK] Bootstrap registration failed (${err.message}) — falling back to direct connection`);
                this._registrationResult = { status: 'skipped' };
                await this.connectDirect();
            }
            else {
                throw err;
            }
        }
    }
    // ─── Private: Registry ──────────────────────────────────
    /**
     * Publish the registry "register" event. Called at boot and again on
     * every `nola.registry.discover` request — the JetStream `NOLA_REGISTRY`
     * stream's 24h retention means a long-running app's original register
     * event eventually ages out, and a fresh projection (eg. a brand-new
     * nola-hq deploy) wouldn't see it. The discover handler closes that
     * gap by asking everyone to re-announce on demand.
     *
     * Includes the bootstrap manifest when available so the projection
     * captures plans / modules / display metadata, not just the bare
     * {name, version, kind, timestamp} tuple.
     */
    async registerService() {
        await this.publish('nola.registry.register', {
            name: this.options.serviceName,
            version: this.options.serviceVersion,
            kind: this.options.kind ?? 'app',
            timestamp: new Date().toISOString(),
            // Prefer the top-level `manifest` so two-phase consumers (Phase 2
            // runs without bootstrap config but still needs to publish its
            // manifest) don't lose it on every register/heartbeat cycle.
            manifest: this.options.manifest ?? this.options.bootstrap?.manifest,
        });
    }
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this.publish('nola.registry.heartbeat', {
                name: this.options.serviceName,
                timestamp: new Date().toISOString(),
            }).catch((err) => {
                console.error('[NolaSDK] Heartbeat failed:', err);
            });
        }, 30_000);
    }
    /**
     * Subscribe to `nola.registry.discover` so this client re-publishes its
     * register payload whenever someone (typically a freshly-deployed
     * nola-hq) asks. Fire-and-forget broadcast — no reply expected; the
     * projection picks the re-published register event up via the
     * existing JetStream consumer on `nola.registry.>`.
     *
     * Errors are logged but never thrown: the discover handler is best-
     * effort, and a failure here shouldn't poison the connection or the
     * heartbeat loop.
     */
    listenForDiscover() {
        const nc = this.nc;
        if (!nc)
            return;
        const sub = nc.subscribe('nola.registry.discover');
        (async () => {
            for await (const _msg of sub) {
                try {
                    await this.registerService();
                    console.log(`[NolaSDK] Re-announced "${this.options.serviceName}" in response to nola.registry.discover`);
                }
                catch (err) {
                    console.warn(`[NolaSDK] Failed to respond to discover:`, err instanceof Error ? err.message : err);
                }
            }
        })();
    }
}
exports.NolaClient = NolaClient;
const METRICS_FLUSH_MS = 60_000;
const METRICS_BUFFER_MAX = 5_000;
/**
 * MetricsRecorder — minimal, framework-agnostic latency/error tracker.
 *
 * Each service that wants its p50/p99 visible in the HQ console wires
 * the small Express middleware (`createMetricsMiddleware(nolaClient)`)
 * in main.ts. The middleware calls `record(durationMs, isError)` for
 * every HTTP request. Every 60s, the recorder computes percentiles
 * over the buffered samples and publishes one snapshot on
 *
 *   nola.events.metrics.<serviceName>
 *
 * The subject deliberately sits outside any app-specific namespace so
 * a single JetStream filter (`nola.events.metrics.>`) on the HQ side
 * collects everything. NATS publish ACLs control who can emit — each
 * service is whitelisted only on its own service-id suffix.
 *
 * The buffer is a ring of the last 5000 samples — beyond that, the
 * oldest are dropped (so a sudden traffic spike doesn't OOM the
 * process). Percentile computation is the trivial sort-and-pick: not
 * a fancy histogram, but accurate for the volume we expect (HQ-visible
 * services do <50 rps).
 */
class MetricsRecorder {
    client;
    samples = [];
    errorCount = 0;
    windowStart = new Date();
    flushTimer = null;
    constructor(client) {
        this.client = client;
    }
    /** Begin the 60s flush loop. Idempotent. */
    start() {
        if (this.flushTimer)
            return;
        this.flushTimer = setInterval(() => {
            void this.flush();
        }, METRICS_FLUSH_MS);
    }
    stop() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
    }
    /**
     * Called from the middleware for every completed request. `isError`
     * groups any 5xx response — 4xx are NOT counted as errors so client
     * mistakes don't blow up the SLA dashboard.
     */
    record(durationMs, isError) {
        if (!Number.isFinite(durationMs) || durationMs < 0)
            return;
        this.samples.push(durationMs);
        if (isError)
            this.errorCount += 1;
        if (this.samples.length > METRICS_BUFFER_MAX) {
            this.samples.splice(0, this.samples.length - METRICS_BUFFER_MAX);
        }
    }
    async flush() {
        const windowEnd = new Date();
        const requestCount = this.samples.length;
        if (requestCount === 0 && this.errorCount === 0) {
            this.windowStart = windowEnd;
            return;
        }
        const sorted = [...this.samples].sort((a, b) => a - b);
        const snapshot = {
            service: this.client.serviceName,
            windowStart: this.windowStart.toISOString(),
            windowEnd: windowEnd.toISOString(),
            requestCount,
            errorCount: this.errorCount,
            p50Ms: percentile(sorted, 0.5),
            p95Ms: percentile(sorted, 0.95),
            p99Ms: percentile(sorted, 0.99),
            maxMs: sorted[sorted.length - 1] ?? 0,
        };
        // Reset BEFORE publish so a slow publish doesn't double-count
        // requests in the next window.
        this.samples = [];
        this.errorCount = 0;
        this.windowStart = windowEnd;
        try {
            await this.client.publish(`nola.events.metrics.${this.client.serviceName}`, snapshot);
        }
        catch (err) {
            console.warn('[NolaSDK] metrics flush failed:', err instanceof Error ? err.message : err);
        }
    }
}
exports.MetricsRecorder = MetricsRecorder;
function percentile(sortedAsc, p) {
    if (sortedAsc.length === 0)
        return 0;
    const idx = Math.min(sortedAsc.length - 1, Math.floor(sortedAsc.length * p));
    return sortedAsc[idx];
}
/**
 * Express-compatible middleware that hooks `res.on('finish')` to
 * record the request duration and 5xx flag. Use:
 *
 *   import { createMetricsMiddleware } from '@nola-studio/sdk';
 *   app.use(createMetricsMiddleware(nolaClient));
 *
 * Works with Nest because Nest sits on Express by default. For
 * Fastify-based services, write a small adapter that calls
 * `nolaClient.getMetrics().record(durationMs, isError)` on response.
 */
function createMetricsMiddleware(client) {
    return function metricsMiddleware(_req, res, next) {
        const start = Date.now();
        res.on('finish', () => {
            const status = res.statusCode ?? 0;
            // Treat 5xx as errors; 4xx are client problems and excluded
            // from the SLA numbers the HQ console shows.
            client
                .getMetrics()
                .record(Date.now() - start, status >= 500);
        });
        next();
    };
}
//# sourceMappingURL=index.js.map