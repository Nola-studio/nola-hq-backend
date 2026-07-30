export const NOLA_CONFIG = Symbol('NOLA_CONFIG');

export type NolaKind = 'app' | 'service';

export interface NolaConfig {
  serviceName: string;
  serviceVersion: string;
  /**
   * Topology kind — 'app' (customer-facing SaaS with tenants/plans) or
   * 'service' (platform-internal infra). Forwarded to the registry so HQ
   * can render apps vs services separately. Default: 'app'.
   */
  kind?: NolaKind;
  natsUrl: string;
  /**
   * Direct NATS credentials. When set, the SDK connects with these and
   * skips the bootstrap announce. Used after the first onboarding once
   * dedicated user/password are known (typically committed in
   * `nats-server.conf` or issued by nola-auth's registry handler).
   */
  natsUser?: string;
  natsPass?: string;
  /**
   * Decentralized-auth credentials (.creds = user JWT + NKey seed). When set,
   * used INSTEAD of natsUser/natsPass. natsTlsCa enables verified TLS;
   * + natsTlsCert/natsTlsKey for mutual TLS. Additive (Phase 3 prep).
   */
  natsCreds?: string;
  natsTlsCa?: string;
  natsTlsCert?: string;
  natsTlsKey?: string;
  bootstrap?: {
    /** Legacy/pre-cutover shared bootstrap creds — omitted when natsCreds is set. */
    bootstrapUser?: string;
    bootstrapPass?: string;
    bootstrapSecret: string;
    realm: string;
    displayName?: string;
    consumes?: string[];
    emits?: string[];
    manifest?: Record<string, unknown>;
  };
  authIssuer?: string;
  authAudience?: string;
  authSessionEndpoint: string;
  enableTracing?: boolean;
  /**
   * Si `true` (dev), le module ne tente pas de se connecter à NATS au boot.
   * Permet de lancer le gateway sans infra externe pour /health & manifest.
   */
  offline?: boolean;
}
