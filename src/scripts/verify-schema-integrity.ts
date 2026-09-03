import { DataSource, getMetadataArgsStorage } from 'typeorm';
import { entities } from '../entities';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/nola_hq_test';
  console.log(`[Tier 2 Postgres CI Gate] Connecting to PostgreSQL at ${dbUrl.replace(/:[^:@]+@/, ':***@')}...`);

  const migrationsDir = path.join(__dirname, '../migrations');
  const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.ts')).sort();

  const migrationClasses: any[] = [];
  for (const f of migrationFiles) {
    const mod = await import(path.join(migrationsDir, f));
    for (const key of Object.keys(mod)) {
      if (typeof mod[key] === 'function' && mod[key].prototype && 'up' in mod[key].prototype) {
        migrationClasses.push(mod[key]);
      }
    }
  }

  const ds = new DataSource({
    type: 'postgres',
    url: dbUrl,
    entities,
    migrations: migrationClasses,
    synchronize: false,
    logging: false,
    ssl: false,
  });

  await ds.initialize();
  console.log(`[Tier 2 Postgres CI Gate] Initialized DataSource. Running ${migrationClasses.length} migrations...`);

  await ds.runMigrations();
  console.log(`[Tier 2 Postgres CI Gate] All migrations executed successfully.`);

  const queryRunner = ds.createQueryRunner();
  const storage = getMetadataArgsStorage();
  const errors: string[] = [];

  for (const entityClass of entities) {
    const tableDef = storage.tables.find(t => t.target === entityClass);
    if (!tableDef) continue;
    const tableName = (typeof tableDef.name === 'string' ? tableDef.name : entityClass.name).toLowerCase();

    const res = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      [tableName]
    );

    const liveDbCols = res.map((r: any) => r.column_name.toLowerCase());
    const entityCols = storage.columns.filter(c => c.target === entityClass);

    for (const c of entityCols) {
      const colName = (c.options.name || c.propertyName).toLowerCase();
      if (!liveDbCols.includes(colName)) {
        errors.push(`Entity "${entityClass.name}" column "${colName}" does not exist in live Postgres table "${tableName}".`);
      }
    }
  }

  await queryRunner.release();
  await ds.destroy();

  if (errors.length > 0) {
    console.error(`\n❌ [Tier 2 Postgres CI Gate] Schema verification FAILED with ${errors.length} unmigrated column(s):`);
    for (const e of errors) {
      console.error(`  - ${e}`);
    }
    process.exit(1);
  }

  console.log(`\n✓ [Tier 2 Postgres CI Gate] SUCCESS: 100% of entity columns verified against live PostgreSQL information_schema.columns.`);
}

main().catch(err => {
  console.error('[Tier 2 Postgres CI Gate] Fatal error:', err);
  process.exit(1);
});
