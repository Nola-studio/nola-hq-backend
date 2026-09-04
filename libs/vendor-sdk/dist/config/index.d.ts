import { z, type ZodTypeAny } from 'zod';
/**
 * Contrat de configuration Nola — porté par le SDK.
 *
 * Ce module est l'unique source de vérité du « socle plateforme » : les variables
 * d'environnement identiques pour toutes les apps d'un même environnement. Chaque
 * app étend ce socle avec son propre schéma (`appSchema`) plutôt que de
 * réimplémenter sa propre validation.
 *
 * Principes :
 *  - Classer : socle plateforme ci-dessous, extension par app, secrets en variables.
 *  - Dériver : tout ce qui se calcule (realm, JWKS, préfixe NATS, schéma Postgres…)
 *    n'est PAS une variable mais une valeur dérivée (cf. `deriveNolaConfig`).
 *  - Fail fast : `loadNolaConfig` refuse de démarrer avec un message clair en
 *    français listant ce qui manque, plutôt que d'échouer à la première requête.
 *
 * INVARIANT : aucune configuration par-tenant ne transite par l'environnement.
 * Le `tenant`/`realm` d'une requête provient du JWT à l'exécution, jamais d'une
 * variable d'environnement.
 */
export declare const NOLA_ENVIRONNEMENTS: readonly ["dev", "staging", "prod"];
export type NolaEnv = (typeof NOLA_ENVIRONNEMENTS)[number];
/**
 * Socle minimal universel. Tout ce qui est ici est garanti présent (ou dérivé)
 * pour n'importe quelle app Nola. Les valeurs réellement universelles confirmées
 * par l'audit : axe d'environnement, bus NATS, identité OIDC, nom d'app.
 */
export declare const nolaPlatformSchema: z.ZodObject<{
    NOLA_ENV: z.ZodEnum<["dev", "staging", "prod"]>;
    NATS_URL: z.ZodEffects<z.ZodString, string, string>;
    OIDC_ISSUER_URL: z.ZodString;
    APP_NAME: z.ZodString;
    NATS_USER: z.ZodOptional<z.ZodString>;
    NATS_PASS: z.ZodOptional<z.ZodString>;
    OTEL_EXPORTER_OTLP_ENDPOINT: z.ZodOptional<z.ZodString>;
    SENTRY_DSN: z.ZodOptional<z.ZodString>;
    CORS_ORIGIN: z.ZodOptional<z.ZodString>;
    LOG_LEVEL: z.ZodOptional<z.ZodEnum<["fatal", "error", "warn", "info", "debug", "trace"]>>;
}, "strip", z.ZodTypeAny, {
    NOLA_ENV: "dev" | "staging" | "prod";
    NATS_URL: string;
    OIDC_ISSUER_URL: string;
    APP_NAME: string;
    OTEL_EXPORTER_OTLP_ENDPOINT?: string | undefined;
    NATS_USER?: string | undefined;
    NATS_PASS?: string | undefined;
    SENTRY_DSN?: string | undefined;
    CORS_ORIGIN?: string | undefined;
    LOG_LEVEL?: "debug" | "error" | "fatal" | "warn" | "info" | "trace" | undefined;
}, {
    NOLA_ENV: "dev" | "staging" | "prod";
    NATS_URL: string;
    OIDC_ISSUER_URL: string;
    APP_NAME: string;
    OTEL_EXPORTER_OTLP_ENDPOINT?: string | undefined;
    NATS_USER?: string | undefined;
    NATS_PASS?: string | undefined;
    SENTRY_DSN?: string | undefined;
    CORS_ORIGIN?: string | undefined;
    LOG_LEVEL?: "debug" | "error" | "fatal" | "warn" | "info" | "trace" | undefined;
}>;
export type NolaPlatformConfig = z.infer<typeof nolaPlatformSchema>;
export interface NolaDerivedConfig {
    /** Environnement courant. */
    env: NolaEnv;
    /** Nom de l'app (kebab-case). */
    appName: string;
    /** Issuer OIDC complet, tel que fourni. */
    oidcIssuerUrl: string;
    /** URL de base Keycloak, dérivée en retirant le suffixe `/realms/<realm>`. */
    keycloakBaseUrl: string;
    /** Realm porté par l'issuer (segment après `/realms/`). Indicatif : à l'exécution, le realm vient du JWT. */
    realm: string;
    /** URL du jeu de clés JWKS, dérivée de l'issuer. */
    jwksUri: string;
    /** Préfixe de subject NATS propre à l'app : `nola.{env}.{app}`. */
    natsSubjectPrefix: string;
    /** Préfixe des subjects d'événements émis par l'app : `nola.events.{app}`. */
    eventsSubjectPrefix: string;
    /** Préfixe des subjects de commandes adressées à l'app : `nola.commands.{app}`. */
    commandsSubjectPrefix: string;
    /** Nom de schéma Postgres conseillé : `nola_{app}`. */
    postgresSchema: string;
    /** Audience OIDC attendue : le nom de l'app. */
    audience: string;
}
/**
 * Calcule l'ensemble des valeurs dérivables à partir du socle. Chaque valeur ici
 * est une variable d'environnement en MOINS dans le contrat de chaque app.
 */
export declare function deriveNolaConfig(base: NolaPlatformConfig): NolaDerivedConfig;
export interface LoadNolaConfigOptions<TApp> {
    /**
     * Schéma zod des variables spécifiques à l'app (mergé au socle plateforme).
     * Ex. `z.object({ AUTH_DATABASE_URL: z.string() })`.
     */
    appSchema?: ZodTypeAny;
    /** Nom de l'app, utilisé comme défaut de `APP_NAME` si la variable est absente. */
    appName?: string;
    /** Source des variables (défaut : `process.env`). */
    env?: Record<string, string | undefined>;
    /** Type uniquement — ignoré à l'exécution. */
    readonly __app?: TApp;
}
export type NolaConfig<TApp = Record<string, never>> = NolaPlatformConfig & TApp & {
    derived: NolaDerivedConfig;
};
/**
 * Charge et valide la configuration d'une app Nola. Lève une erreur explicite
 * (en français) si une variable du socle ou du schéma app manque/est invalide.
 *
 * @throws Error si la validation échoue (fail fast).
 */
export declare function loadNolaConfig<TApp = Record<string, never>>(options?: LoadNolaConfigOptions<TApp>): NolaConfig<TApp>;
/**
 * Fabrique une fonction `validate` compatible avec
 * `ConfigModule.forRoot({ validate })`. Elle valide le socle + le schéma app au
 * boot (fail fast) et réinjecte les valeurs dérivées sous leurs noms historiques
 * (KEYCLOAK_BASE_URL, etc.) pour que `ConfigService.get(...)` continue de
 * fonctionner sans modifier chaque appelant.
 *
 * Expose aussi la config structurée sous la clé `nola` (`ConfigService.get('nola')`).
 */
export declare function createNolaConfigValidation<TApp = Record<string, never>>(options?: Omit<LoadNolaConfigOptions<TApp>, 'env'>): (config: Record<string, unknown>) => Record<string, unknown>;
//# sourceMappingURL=index.d.ts.map