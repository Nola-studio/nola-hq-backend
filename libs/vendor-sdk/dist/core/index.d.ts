import { NatsConnection } from 'nats';
/**
 * What this NATS client represents in the platform topology.
 * - `app`     = multi-tenant customer-facing SaaS (kelasi, mycvmatcher, …).
 *               Has end-users, subscriptions, plans. Appears in HQ Tenants /
 *               Billing views.
 * - `service` = platform-internal infrastructure (nola-auth, nola-billing,
 *               nola-hq, etc). No commercial concept. Appears in HQ
 *               Operations / Services view.
 *
 * Forwarded in the `nola.registry.register` payload so registry projections
 * (nola-studio, nola-hq) can render apps and services separately. Defaults
 * to `'app'` when omitted, for backward compat with existing manifests.
 */
export type NolaKind = 'app' | 'service';
export interface NolaClientOptions {
    /** NATS server URL */
    natsUrl: string;
    /** Service name (used for registry heartbeat) */
    serviceName: string;
    /** Service version */
    serviceVersion: string;
    /** What this client represents (default: 'app'). See NolaKind. */
    kind?: NolaKind;
    /** NATS user credentials (dedicated — or bootstrap for auto-registration) */
    natsUser?: string;
    natsPass?: string;
    /**
     * Decentralized-auth credentials — the content of a `.creds` file
     * (user JWT + NKey seed). When set, used INSTEAD of natsUser/natsPass
     * (challenge-response NKey auth → no secret ever transits the wire).
     * Additive: absent → the classic user/pass path is unchanged.
     */
    natsCreds?: string;
    /**
     * PEM of the private CA that signs the NATS server certificate. When set,
     * the connection is upgraded to TLS and the server is verified against
     * this CA. Additive: absent → plaintext (current behaviour).
     */
    natsTlsCa?: string;
    /**
     * Client certificate + key (PEM) for mutual TLS. When set alongside
     * natsTlsCa, the client presents this cert to a server configured with
     * `verify: true`. Additive: absent → server-TLS only (or plaintext).
     */
    natsTlsCert?: string;
    natsTlsKey?: string;
    /**
     * The service manifest (nola.yaml content) shipped with every register
     * event. Decoupled from `bootstrap` so two-phase consumers (which
     * skip bootstrap once they have dedicated creds) can still publish
     * their manifest to registry projections. Optional — services with no
     * customer-facing concept (internal infra) may omit it.
     */
    manifest?: Record<string, unknown>;
    /**
     * Bootstrap registration config.
     * When provided, the SDK connects with bootstrap credentials first,
     * sends an announce request, receives dedicated credentials,
     * then reconnects with the dedicated account.
     */
    bootstrap?: BootstrapConfig;
}
export interface BootstrapConfig {
    /**
     * Bootstrap NATS user (shared across apps). Legacy/pre-cutover only —
     * ignored when the app supplies its own dedicated `natsCreds`, in which
     * case the announce goes over the app's own account (which imports
     * `nola.bootstrap.announce`), so no shared password is needed.
     */
    bootstrapUser?: string;
    /** Bootstrap NATS password. Legacy/pre-cutover only (see bootstrapUser). */
    bootstrapPass?: string;
    /** Secret that nola-auth validates before provisioning (always required). */
    bootstrapSecret: string;
    /** Auth realm name (defaults to serviceName) */
    realm?: string;
    /** Display name for the Keycloak realm */
    displayName?: string;
    /** Events this app consumes (for NATS permission scoping) */
    consumes?: string[];
    /** Events this app emits */
    emits?: string[];
    /** Timeout for the announce request in ms (default: 15000) */
    timeoutMs?: number;
    /** Full nola.yaml manifest content (plans, modules, services, admin_actions, display) */
    manifest?: Record<string, unknown>;
    /**
     * Extra user-attribute → token-claim mappers to provision on the BFF client.
     * `tenant_id` is always added by nola-auth; declare additional ones here.
     * Example: [{ attribute: 'school_id', claim: 'school_id' }]
     */
    userClaims?: Array<{
        attribute: string;
        claim: string;
    }>;
}
export interface RegistrationResult {
    status: 'provisioned' | 'already_exists' | 'skipped';
    natsUser?: string;
    natsPass?: string;
    bffClientId?: string;
    bffClientSecret?: string;
    publicClientId?: string;
    authIssuer?: string;
}
export declare class NolaClient {
    private nc;
    private heartbeatInterval;
    private readonly sc;
    private readonly jc;
    private options;
    private _registrationResult;
    private metricsRecorder;
    constructor(options: NolaClientOptions);
    /** Service name used by this client — exposed so middleware factories
     *  can publish on the right subject without poking at private state. */
    get serviceName(): string;
    /**
     * Lazily-created metrics recorder. Returns the same instance across
     * calls. The recorder schedules its own flush loop the first time
     * it's instantiated, so just calling this getter from a middleware
     * is enough to start emitting.
     */
    getMetrics(): MetricsRecorder;
    /** Connect to NATS and start heartbeat. If bootstrap config is provided, auto-registers first. */
    start(): Promise<void>;
    /** Get the registration result (available after start() with bootstrap config) */
    get registrationResult(): RegistrationResult | null;
    /** Get the underlying NATS connection */
    getConnection(): NatsConnection;
    /** Publish a JSON message to a NATS subject */
    publish<T>(subject: string, data: T): Promise<void>;
    /** Send a request and wait for a reply */
    request<TReq, TRes>(subject: string, data: TReq, timeoutMs?: number): Promise<TRes>;
    /** Subscribe to a NATS subject */
    subscribe(subject: string, handler: (data: unknown, subject: string) => void): Promise<void>;
    /** Gracefully disconnect */
    stop(): Promise<void>;
    /**
     * TLS (private CA) + hardened reconnection profile shared by every
     * connect() in the SDK. The reconnection profile mirrors the kelasi
     * services (never give up + jittered backoff + a short ping so a
     * half-open socket after a NATS restart is detected in ~40s instead of
     * the ~4-6 min the nats.js default leaves it a zombie).
     */
    private connectionDefaults;
    /** Auth block: creds-based (decentralized) when provided, else user/pass. */
    private authOptions;
    private connectDirect;
    private bootstrapAndRegister;
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
    private registerService;
    private startHeartbeat;
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
    private listenForDiscover;
}
/** Snapshot published every flush interval. */
export interface MetricsSnapshot {
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
export declare class MetricsRecorder {
    private readonly client;
    private samples;
    private errorCount;
    private windowStart;
    private flushTimer;
    constructor(client: NolaClient);
    /** Begin the 60s flush loop. Idempotent. */
    start(): void;
    stop(): void;
    /**
     * Called from the middleware for every completed request. `isError`
     * groups any 5xx response — 4xx are NOT counted as errors so client
     * mistakes don't blow up the SLA dashboard.
     */
    record(durationMs: number, isError: boolean): void;
    private flush;
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
export declare function createMetricsMiddleware(client: NolaClient): (_req: {
    method?: string;
    url?: string;
}, res: {
    on: (event: string, cb: () => void) => void;
    statusCode?: number;
}, next: () => void) => void;
//# sourceMappingURL=index.d.ts.map