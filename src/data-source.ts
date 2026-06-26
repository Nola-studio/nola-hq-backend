import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { entities } from './entities';

/**
 * Standalone TypeORM DataSource for the migration CLI (generate/run/revert).
 *
 * Migrations target Postgres (the production engine). SQLite dev keeps
 * `synchronize: true` in app.module — it has no production data to protect —
 * so the CLI is Postgres-only and requires DATABASE_URL.
 *
 *   docker run -d --name pg -e POSTGRES_PASSWORD=pg -p 5432:5432 postgres:16
 *   DATABASE_URL=postgres://postgres:pg@localhost:5432/postgres \
 *     bun run migration:generate src/migrations/Name
 */
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    'DATABASE_URL is required for TypeORM migrations (Postgres). ' +
      'Migrations do not target the SQLite dev database.',
  );
}

const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const isInternal = /\.railway\.internal/.test(url);

export default new DataSource({
  type: 'postgres',
  url,
  entities,
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  logging: false,
  ssl: isLocal || isInternal ? false : { rejectUnauthorized: false },
});
