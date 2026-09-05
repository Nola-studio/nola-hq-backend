# @nola/sdk

Biblioth\u00e8que partag\u00e9e de la plateforme Nola. Fournit les primitives de communication inter-services, l'authentification, l'observabilit\u00e9 et les clients m\u00e9tier utilis\u00e9s par tous les services Core et les applications de l'\u00e9cosyst\u00e8me.

## Installation

```bash
# Depuis la racine du monorepo
npm install
# Le workspace r\u00e9sout automatiquement @nola/sdk via le lien local
```

## Modules

| Module | Import | Description |
|--------|--------|-------------|
| **Core** | `@nola/sdk/core` | Client NATS (connexion, pub/sub, request-reply) |
| **EventBus** | `@nola/sdk/events` | Publication et consommation d'\u00e9v\u00e9nements via JetStream |
| **CommandBus** | `@nola/sdk/commands` | Dispatch de commandes synchrones (request-reply) |
| **Discovery** | `@nola/sdk/discovery` | Registre de services et d\u00e9couverte d'applications |
| **Auth** | `@nola/sdk/auth` | V\u00e9rification JWT et contr\u00f4le d'acc\u00e8s |
| **HMAC** | `@nola/sdk/hmac` | Authentification HMAC-SHA256 inter-services |
| **Notify** | `@nola/sdk/notify` | Client de notification (email, SMS, WhatsApp) |
| **Tracing** | `@nola/sdk/tracing` | Instrumentation OpenTelemetry (traces + m\u00e9triques) |

## Utilisation rapide

### NolaClient (connexion NATS)

```typescript
import { NolaClient } from '@nola/sdk';

const client = new NolaClient({
  natsUrl: 'nats://localhost:4222',
  serviceName: 'my-service',
  serviceVersion: '1.0.0',
});

await client.start();
// Le service s'enregistre automatiquement + heartbeat 30s
```

### EventBus (publication d'\u00e9v\u00e9nements)

```typescript
import { EventBus } from '@nola/sdk';

const eventBus = new EventBus(client.getConnection());
await eventBus.init();

await eventBus.ensureStream({
  name: 'NOLA_EVENTS',
  subjects: ['nola.events.>'],
  max_age: 30 * 24 * 3600 * 1_000_000_000, // 30 jours
});

await eventBus.emit('nola.events.auth.user.created', { userId: '...' }, 'nola-auth');
```

### CommandBus (request-reply)

```typescript
import { CommandBus } from '@nola/sdk';

const commandBus = new CommandBus(client.getConnection());

// Envoyer une commande
const result = await commandBus.send('nola.commands.notify.send', payload, {
  correlationId: 'req-123',
  issuedBy: 'nola-billing',
});

// G\u00e9rer une commande
commandBus.handle('nola.commands.billing.create', async (envelope) => {
  return { success: true, data: { id: '...' } };
});
```

### AuthClient (v\u00e9rification JWT)

```typescript
import { AuthClient } from '@nola/sdk';

const auth = new AuthClient({ issuer: 'https://auth.nola.app/realms/my-realm' });
const payload = await auth.verifyToken(token);

auth.hasRole(payload, 'admin');       // boolean
auth.hasAppAccess(payload, 'kelasi'); // boolean
auth.isImpersonated(payload);          // boolean
```

### HMAC (authentification server-to-server)

```typescript
import { HmacAuth, hmacMiddleware } from '@nola/sdk';

// C\u00f4t\u00e9 client
const hmac = new HmacAuth({ secret: process.env.HMAC_SECRET });
const headers = hmac.sign('POST', '/auth/silent-login', body);

// C\u00f4t\u00e9 serveur (Express middleware)
app.use('/auth/silent-login', hmacMiddleware({ secret: process.env.HMAC_SECRET }));
```

### Tracing (OpenTelemetry)

```typescript
import { initTracing } from '@nola/sdk/tracing';

const sdk = initTracing({
  serviceName: 'nola-auth',
  serviceVersion: '0.1.0',
  otlpEndpoint: 'http://otel-collector:4318',
});
// Traces + m\u00e9triques export\u00e9es automatiquement
```

## Scripts

```bash
npm run build       # Compile TypeScript \u2192 dist/
npm run dev         # Watch mode
npm run test        # Tests unitaires (vitest)
npm run test:watch  # Tests en mode watch
```

## Architecture

```
src/
\u251c\u2500\u2500 index.ts          # Barrel exports
\u251c\u2500\u2500 core/index.ts     # NolaClient (NATS)
\u251c\u2500\u2500 events/index.ts   # EventBus (JetStream)
\u251c\u2500\u2500 commands/index.ts # CommandBus (request-reply)
\u251c\u2500\u2500 discovery/index.ts# DiscoveryService
\u251c\u2500\u2500 auth/index.ts     # AuthClient (JWT/JWKS)
\u251c\u2500\u2500 hmac/index.ts     # HmacAuth + middleware
\u251c\u2500\u2500 notify/index.ts   # NotifyClient
\u2514\u2500\u2500 tracing/index.ts  # OpenTelemetry init
```

## D\u00e9pendances cl\u00e9s

- **nats** `^2.19.0` \u2014 Client NATS + JetStream
- **jose** `^5.2.0` \u2014 V\u00e9rification JWT/JWKS
- **@opentelemetry/*** \u2014 SDK, exporters OTLP, instrumentations (HTTP, Express, NestJS)
