"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const index_js_1 = require("./index.js");
const zod_1 = require("zod");
const baseEnv = {
    NOLA_ENV: 'dev',
    NATS_URL: 'nats://localhost:4222',
    OIDC_ISSUER_URL: 'https://auth.nola.cd/realms/nola-auth',
    APP_NAME: 'nola-auth',
};
(0, vitest_1.describe)('loadNolaConfig — socle plateforme', () => {
    (0, vitest_1.it)('charge un socle valide', () => {
        const cfg = (0, index_js_1.loadNolaConfig)({ env: baseEnv });
        (0, vitest_1.expect)(cfg.NOLA_ENV).toBe('dev');
        (0, vitest_1.expect)(cfg.APP_NAME).toBe('nola-auth');
    });
    (0, vitest_1.it)('échoue (fail fast) avec un message français listant les variables manquantes', () => {
        (0, vitest_1.expect)(() => (0, index_js_1.loadNolaConfig)({ env: {} })).toThrowError(/Démarrage impossible/);
        try {
            (0, index_js_1.loadNolaConfig)({ env: {} });
        }
        catch (e) {
            const msg = e.message;
            (0, vitest_1.expect)(msg).toContain('NOLA_ENV');
            (0, vitest_1.expect)(msg).toContain('NATS_URL');
            (0, vitest_1.expect)(msg).toContain('OIDC_ISSUER_URL');
        }
    });
    (0, vitest_1.it)('rejette un NATS_URL au mauvais schéma', () => {
        (0, vitest_1.expect)(() => (0, index_js_1.loadNolaConfig)({ env: { ...baseEnv, NATS_URL: 'http://x' } })).toThrowError(/nats:\/\//);
    });
});
(0, vitest_1.describe)('loadNolaConfig — dérivation', () => {
    (0, vitest_1.it)('dérive realm, base Keycloak, JWKS, préfixes et schéma Postgres', () => {
        const { derived } = (0, index_js_1.loadNolaConfig)({ env: baseEnv });
        (0, vitest_1.expect)(derived.keycloakBaseUrl).toBe('https://auth.nola.cd');
        (0, vitest_1.expect)(derived.realm).toBe('nola-auth');
        (0, vitest_1.expect)(derived.jwksUri).toBe('https://auth.nola.cd/realms/nola-auth/protocol/openid-connect/certs');
        (0, vitest_1.expect)(derived.natsSubjectPrefix).toBe('nola.dev.nola-auth');
        (0, vitest_1.expect)(derived.eventsSubjectPrefix).toBe('nola.events.nola-auth');
        (0, vitest_1.expect)(derived.postgresSchema).toBe('nola_nola_auth');
        (0, vitest_1.expect)(derived.audience).toBe('nola-auth');
    });
    (0, vitest_1.it)('deriveNolaConfig fonctionne indépendamment', () => {
        const d = (0, index_js_1.deriveNolaConfig)(index_js_1.nolaPlatformSchema.parse(baseEnv));
        (0, vitest_1.expect)(d.env).toBe('dev');
    });
});
(0, vitest_1.describe)('loadNolaConfig — extension par app', () => {
    const appSchema = zod_1.z.object({
        AUTH_DATABASE_URL: zod_1.z.string().min(1, 'est requise'),
    });
    (0, vitest_1.it)('valide le schéma app en plus du socle', () => {
        const cfg = (0, index_js_1.loadNolaConfig)({
            env: { ...baseEnv, AUTH_DATABASE_URL: 'postgres://x' },
            appSchema,
        });
        (0, vitest_1.expect)(cfg.AUTH_DATABASE_URL).toBe('postgres://x');
    });
    (0, vitest_1.it)('échoue si une variable app manque', () => {
        (0, vitest_1.expect)(() => (0, index_js_1.loadNolaConfig)({ env: baseEnv, appSchema })).toThrowError(/AUTH_DATABASE_URL/);
    });
});
(0, vitest_1.describe)('loadNolaConfig — migration douce', () => {
    (0, vitest_1.it)('dérive NOLA_ENV depuis NODE_ENV', () => {
        const cfg = (0, index_js_1.loadNolaConfig)({
            env: { ...baseEnv, NOLA_ENV: undefined, NODE_ENV: 'production' },
        });
        (0, vitest_1.expect)(cfg.NOLA_ENV).toBe('prod');
    });
    (0, vitest_1.it)('synthétise OIDC_ISSUER_URL depuis KEYCLOAK_BASE_URL (legacy)', () => {
        const cfg = (0, index_js_1.loadNolaConfig)({
            appName: 'nola-auth',
            env: {
                NOLA_ENV: 'dev',
                NATS_URL: 'nats://localhost:4222',
                KEYCLOAK_BASE_URL: 'http://localhost:8080',
            },
        });
        (0, vitest_1.expect)(cfg.OIDC_ISSUER_URL).toBe('http://localhost:8080/realms/nola-auth');
        (0, vitest_1.expect)(cfg.derived.keycloakBaseUrl).toBe('http://localhost:8080');
    });
    (0, vitest_1.it)('utilise appName comme défaut de APP_NAME', () => {
        const cfg = (0, index_js_1.loadNolaConfig)({
            appName: 'nola-billing',
            env: { NOLA_ENV: 'dev', NATS_URL: 'nats://localhost:4222', OIDC_ISSUER_URL: baseEnv.OIDC_ISSUER_URL },
        });
        (0, vitest_1.expect)(cfg.APP_NAME).toBe('nola-billing');
    });
});
(0, vitest_1.describe)('createNolaConfigValidation — intégration NestJS', () => {
    (0, vitest_1.it)('réinjecte les valeurs dérivées sous leurs noms historiques', () => {
        const validate = (0, index_js_1.createNolaConfigValidation)({ appName: 'nola-auth' });
        const out = validate({ ...baseEnv });
        (0, vitest_1.expect)(out.KEYCLOAK_BASE_URL).toBe('https://auth.nola.cd');
        (0, vitest_1.expect)(out.NOLA_JWKS_URI).toBe('https://auth.nola.cd/realms/nola-auth/protocol/openid-connect/certs');
        (0, vitest_1.expect)(out.nola.derived.audience).toBe('nola-auth');
    });
    (0, vitest_1.it)('lève au boot si le socle est incomplet', () => {
        const validate = (0, index_js_1.createNolaConfigValidation)({ appName: 'nola-auth' });
        (0, vitest_1.expect)(() => validate({})).toThrowError(/Démarrage impossible/);
    });
});
//# sourceMappingURL=index.spec.js.map