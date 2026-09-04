"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nolaPlatformSchema = exports.NOLA_ENVIRONNEMENTS = void 0;
exports.deriveNolaConfig = deriveNolaConfig;
exports.loadNolaConfig = loadNolaConfig;
exports.createNolaConfigValidation = createNolaConfigValidation;
const zod_1 = require("zod");
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
// ─── Axe d'environnement ──────────────────────────────────────────────────────
exports.NOLA_ENVIRONNEMENTS = ['dev', 'staging', 'prod'];
/** Mappe un NODE_ENV (legacy) vers un NOLA_ENV. Permet de dériver NOLA_ENV. */
function nodeEnvToNolaEnv(nodeEnv) {
    switch (nodeEnv) {
        case 'production':
            return 'prod';
        case 'staging':
            return 'staging';
        case 'development':
        case 'test':
            return 'dev';
        default:
            return undefined;
    }
}
// ─── Schéma du socle plateforme ───────────────────────────────────────────────
const NIVEAUX_LOG = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
/**
 * Socle minimal universel. Tout ce qui est ici est garanti présent (ou dérivé)
 * pour n'importe quelle app Nola. Les valeurs réellement universelles confirmées
 * par l'audit : axe d'environnement, bus NATS, identité OIDC, nom d'app.
 */
exports.nolaPlatformSchema = zod_1.z.object({
    // ── Requis ──
    NOLA_ENV: zod_1.z.enum(exports.NOLA_ENVIRONNEMENTS, {
        errorMap: () => ({ message: `doit valoir l'un de : ${exports.NOLA_ENVIRONNEMENTS.join(' | ')}` }),
    }),
    NATS_URL: zod_1.z
        .string()
        .min(1, 'est requise')
        .refine((v) => /^nats:\/\//.test(v), { message: "doit commencer par 'nats://'" }),
    OIDC_ISSUER_URL: zod_1.z
        .string()
        .min(1, 'est requise')
        .url("doit être une URL absolue (ex. https://auth.nola.cd/realms/<realm>)"),
    APP_NAME: zod_1.z
        .string()
        .regex(/^[a-z][a-z0-9-]{1,49}$/, "doit être en kebab-case (ex. nola-auth)"),
    // ── Optionnels (avec valeur par défaut ou dérivés) ──
    NATS_USER: zod_1.z.string().optional(),
    NATS_PASS: zod_1.z.string().optional(),
    OTEL_EXPORTER_OTLP_ENDPOINT: zod_1.z.string().url().optional(),
    SENTRY_DSN: zod_1.z.string().optional(),
    CORS_ORIGIN: zod_1.z.string().optional(),
    LOG_LEVEL: zod_1.z.enum(NIVEAUX_LOG).optional(),
});
/**
 * Calcule l'ensemble des valeurs dérivables à partir du socle. Chaque valeur ici
 * est une variable d'environnement en MOINS dans le contrat de chaque app.
 */
function deriveNolaConfig(base) {
    const issuer = base.OIDC_ISSUER_URL.replace(/\/$/, '');
    const marker = '/realms/';
    const idx = issuer.indexOf(marker);
    const keycloakBaseUrl = idx === -1 ? issuer : issuer.slice(0, idx);
    const realm = idx === -1 ? '' : issuer.slice(idx + marker.length).split('/')[0];
    const schemaSafe = base.APP_NAME.replace(/-/g, '_');
    return {
        env: base.NOLA_ENV,
        appName: base.APP_NAME,
        oidcIssuerUrl: issuer,
        keycloakBaseUrl,
        realm,
        jwksUri: `${issuer}/protocol/openid-connect/certs`,
        natsSubjectPrefix: `nola.${base.NOLA_ENV}.${base.APP_NAME}`,
        eventsSubjectPrefix: `nola.events.${base.APP_NAME}`,
        commandsSubjectPrefix: `nola.commands.${base.APP_NAME}`,
        postgresSchema: `nola_${schemaSafe}`,
        audience: base.APP_NAME,
    };
}
/**
 * Pré-remplit les variables socle dérivables pour offrir une migration douce :
 *  - NOLA_ENV dérivé de NODE_ENV si absent ;
 *  - OIDC_ISSUER_URL synthétisé depuis l'historique KEYCLOAK_BASE_URL si absent ;
 *  - APP_NAME alimenté par l'option `appName`.
 */
function appliquerDefauts(env, appName) {
    const out = { ...env };
    if (!out.APP_NAME && appName) {
        out.APP_NAME = appName;
    }
    if (!out.NOLA_ENV) {
        const derive = nodeEnvToNolaEnv(out.NODE_ENV);
        if (derive)
            out.NOLA_ENV = derive;
    }
    // Compat : l'ancien contrat exposait KEYCLOAK_BASE_URL (base) plutôt qu'un
    // issuer complet. On synthétise OIDC_ISSUER_URL le temps de la migration.
    if (!out.OIDC_ISSUER_URL && out.KEYCLOAK_BASE_URL) {
        const realm = out.NOLA_REALM ?? out.APP_NAME ?? 'master';
        out.OIDC_ISSUER_URL = `${out.KEYCLOAK_BASE_URL.replace(/\/$/, '')}/realms/${realm}`;
    }
    return out;
}
function formaterErreurs(prefix, issues) {
    const lignes = issues
        .map((i) => `  - ${i.path.join('.') || '(racine)'} : ${i.message}`)
        .join('\n');
    return (`\n[${prefix}] Démarrage impossible — variables d'environnement manquantes ou invalides :\n` +
        `${lignes}\n\n` +
        `Renseignez ces variables (voir la section « env » du nola.yaml de l'app) avant de démarrer.\n`);
}
/**
 * Charge et valide la configuration d'une app Nola. Lève une erreur explicite
 * (en français) si une variable du socle ou du schéma app manque/est invalide.
 *
 * @throws Error si la validation échoue (fail fast).
 */
function loadNolaConfig(options = {}) {
    const prefix = options.appName ?? 'nola-config';
    const env = appliquerDefauts(options.env ?? process.env, options.appName);
    const platform = exports.nolaPlatformSchema.safeParse(env);
    const app = options.appSchema ? options.appSchema.safeParse(env) : undefined;
    const issues = [];
    if (!platform.success)
        issues.push(...platform.error.issues);
    if (app && !app.success)
        issues.push(...app.error.issues);
    if (issues.length > 0) {
        throw new Error(formaterErreurs(prefix, issues));
    }
    const base = platform.data;
    const derived = deriveNolaConfig(base);
    return {
        ...base,
        ...app?.data,
        derived,
    };
}
// ─── Intégration NestJS (@nestjs/config) ──────────────────────────────────────
/**
 * Fabrique une fonction `validate` compatible avec
 * `ConfigModule.forRoot({ validate })`. Elle valide le socle + le schéma app au
 * boot (fail fast) et réinjecte les valeurs dérivées sous leurs noms historiques
 * (KEYCLOAK_BASE_URL, etc.) pour que `ConfigService.get(...)` continue de
 * fonctionner sans modifier chaque appelant.
 *
 * Expose aussi la config structurée sous la clé `nola` (`ConfigService.get('nola')`).
 */
function createNolaConfigValidation(options = {}) {
    return (config) => {
        const loaded = loadNolaConfig({
            ...options,
            env: config,
        });
        // `flat` = valeurs validées/coercées du socle + du schéma app (sans l'objet dérivé).
        const { derived, ...flat } = loaded;
        return {
            ...config,
            ...flat, // les valeurs coercées (ex. ports en nombre) priment sur les chaînes brutes
            // Valeurs dérivées réinjectées sous leurs noms historiques (rétro-compat).
            KEYCLOAK_BASE_URL: derived.keycloakBaseUrl,
            NOLA_REALM: derived.realm,
            NOLA_JWKS_URI: derived.jwksUri,
            NOLA_NATS_SUBJECT_PREFIX: derived.natsSubjectPrefix,
            NOLA_POSTGRES_SCHEMA: derived.postgresSchema,
            NOLA_AUDIENCE: derived.audience,
            // Accès structuré : ConfigService.get('nola')
            nola: loaded,
        };
    };
}
//# sourceMappingURL=index.js.map