# Nola Studio HQ — Backend

Backend NestJS qui alimente la console méta-plateforme **Nola Studio** (apps Kelasi, Kriver, MyCVMatcher, Nola Stock, Vente, Verify) déployée en RDC, Côte d'Ivoire, Sénégal, Cameroun et Rwanda.

API REST + JWT + Swagger + persistance SQLite (TypeORM). Le seed reproduit fidèlement les données de démonstration de [`nola-hq`](../nola-hq) afin que le backend soit utilisable immédiatement après installation.

## Démarrage rapide

```bash
cd nola-hq-backend
bun install
bun run start:dev
```

- API : http://localhost:3001/api/v1
- Swagger UI : http://localhost:3001/docs
- DB SQLite : `./data/nola.sqlite` (créée automatiquement)

### Variables d'environnement

Voir `.env` (rempli avec des valeurs de dev). Les clés importantes :

| Variable                  | Défaut                            | Description                                            |
| ------------------------- | --------------------------------- | ------------------------------------------------------ |
| `PORT`                    | `3001`                            | Port HTTP                                              |
| `DB_PATH`                 | `./data/nola.sqlite`              | Chemin du fichier SQLite                               |
| `SESSION_COOKIE_NAME`     | `nola_hq_session`                 | Nom du cookie de session                               |
| `SESSION_COOKIE_SAMESITE` | `lax`                             | `lax` \| `strict` \| `none`                            |
| `SESSION_COOKIE_SECURE`   | `false`                           | `true` en prod (HTTPS)                                 |
| `SESSION_TTL_SECONDS`     | `43200` (12 h)                    | Durée de vie de la session                             |
| `SESSION_ENCRYPTION_KEY`  | clé zéro de dev                   | 32 octets base64 — `openssl rand -base64 32`           |
| `CORS_ORIGINS`            | `http://localhost:5173,…`         | Origines autorisées (séparées par `,`)                 |

## Authentification

Pattern aligné sur **`kelasi-backend/apps/api-gateway/src/auth`** : session
sans état portée par un cookie chiffré AES-256-GCM (`nola_hq_session`). La
forme des claims est `NolaJwtPayload` (`sub`, `realm`, `tenant_id`, `email`,
`name`, `roles`, `apps_actives`, `modules_actifs`, `plan`, `impersonator?`)
pour rester homogène avec le reste de la plateforme Nola.

Différences vs Kelasi : les utilisateurs HQ sont l'équipe Nola interne, donc
pas de Keycloak — bcrypt local sur `team_members.password_hash`. Le réalm
est `nola-hq`, le tenant `nola-studio`.

Tous les comptes seedés partagent le mot de passe **`nola1234`**. Login :

```bash
curl -i -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -c cookies.txt \
  -d '{ "email": "christian@nola.cd", "password": "nola1234" }'

curl http://localhost:3001/api/v1/auth/me -b cookies.txt
```

La réponse contient aussi `sessionId` pour les clients sans cookies
(`Authorization: Bearer <sessionId>` est accepté en repli).

Comptes disponibles :

| Email                 | Rôle             |
| --------------------- | ---------------- |
| christian@nola.cd     | Super-Admin      |
| patricia@nola.cd      | Customer Success |
| kevin@nola.cd         | Engineer         |
| aissata@nola.ci       | Sales            |
| jeanmarc@nola.cd      | Finance          |
| benedicte@nola.cd     | Support N1       |

Codes d'erreur (alignés avec kelasi) : `invalid_credentials`,
`missing_session`, `session_expired`, `session_not_found`,
`user_missing_tenant_id`, `not_authenticated`.

Pour mémoire : décorateurs partagés `@CurrentUser()` et `@Tenant()` dans
`src/common/auth/`, mêmes signatures que `@kelasi/common`.

## Aperçu des endpoints

| Domaine        | Endpoints clés                                                                |
| -------------- | ------------------------------------------------------------------------------ |
| Auth           | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`                        |
| Dashboard      | `GET /dashboard`, `GET /kpis`, `GET /analytics/growth`, `GET /nps`             |
| Tenants        | `GET /tenants`, `GET /tenants/:id/detail`, `POST /tenants/:id/change-plan`, `POST /tenants/:id/suspend`, `GET /tenants/recovery` |
| Apps           | `GET /apps`, `PATCH /apps/:id`                                                 |
| Modules        | `GET /modules?app=…`, `PATCH /modules/:id`                                     |
| Plans          | `GET /plans`, `GET /plans/feature-matrix`                                      |
| Team           | `GET /team`, `PATCH /team/:id`                                                 |
| Pipeline       | `GET /pipeline/board`, `POST /pipeline/items`, `POST /pipeline/items/:id/move` |
| Tickets        | `GET /tickets`, `POST /tickets`, `POST /tickets/:id/replies`, `PATCH /tickets/:id/status` |
| Invoices       | `GET /invoices`, `GET /invoices/summary`, `GET /invoices/overdue`              |
| Mobile Money   | `GET /momo`, `GET /momo/summary`                                               |
| Health         | `GET /health/ping` (public), `GET /health`, `GET /health/overall`              |
| Deploys        | `GET /deploys`, `POST /deploys`, `POST /deploys/:id/rollback`                  |
| Logs           | `GET /logs`, `POST /logs`                                                      |
| Audit          | `GET /audit`, `POST /audit`                                                    |
| Activity       | `GET /activity`, `POST /activity`                                              |
| Broadcast      | `GET /broadcasts`, `POST /broadcasts`, `POST /broadcasts/:id/send`             |
| Countries      | `GET /countries`, `GET /countries/:id`                                         |

La spécification OpenAPI complète est disponible sur `/docs`.

## Structure

```
src/
├── main.ts                # bootstrap, CORS, validation, Swagger
├── app.module.ts          # composition racine
├── entities.ts            # liste centrale TypeORM
├── common/                # decorators, guards, DTO partagés
├── auth/                  # JWT, login, /me
├── seed/                  # données initiales (fidèles au front)
├── countries/ apps/ plans/ app-modules/ team/
├── tenants/               # CRUD + détail + actions plan/suspend
├── pipeline/ broadcast/
├── invoices/ momo/
├── tickets/ deploys/ health/ logs/ audit/ activity/
└── analytics/             # KPIs, dashboard, NPS, growth
```

## Données seed

Au premier démarrage, le service `SeedService` insère :

- 5 pays (CD/CI/SN/CM/RW)
- 6 apps (Kelasi, Kriver, MyCVMatcher, Nola Stock, Nola Vente, Nola Verify)
- 4 plans + matrice de features
- 6 membres d'équipe
- 18 tenants
- pipeline commercial (5 stages)
- 23 événements d'activité
- 8 tickets, 11 factures, 11 transactions mobile money
- 6 déploiements, 6 entrées d'audit, 8 logs
- 9 modules / feature flags
- 6 KPIs avec séries temporelles

Pour repartir d'une base propre, supprime simplement `data/nola.sqlite`.

## Scripts

```bash
bun run start:dev     # nest start --watch
bun run build         # compile TypeScript
bun run start:prod    # node dist/main.js
bun run typecheck     # tsc --noEmit
```

## CORS

Le backend autorise par défaut le front Vite (`5173`) ; ajoute d'autres origines en éditant `CORS_ORIGINS` dans `.env`.
