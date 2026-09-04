import { getMetadataArgsStorage } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { entities } from '../entities';

export class MigrationSchemaTracker {
  public tables: Record<string, Set<string>> = {};

  async query(sql: string): Promise<any> {
    const s = sql.trim();

    // 1. CREATE TABLE
    const createMatch = s.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["']?([a-zA-Z0-9_]+)["']?\s*\(([\s\S]*)\)/i);
    if (createMatch) {
      const tableName = createMatch[1].toLowerCase();
      if (!this.tables[tableName]) this.tables[tableName] = new Set();

      const body = createMatch[2];
      const colRegex = /(?:^|,)\s*["']?([a-zA-Z0-9_]+)["']?\s+(character varying|varchar|text|integer|int|numeric|boolean|date|timestamp|uuid|json|jsonb|simple-json|bigint|smallint|double precision|real|serial|bigserial)/gi;
      let colMatch;
      while ((colMatch = colRegex.exec(body)) !== null) {
        const colName = colMatch[1].toLowerCase();
        if (!['constraint', 'primary', 'foreign', 'unique', 'check'].includes(colName)) {
          this.tables[tableName].add(colName);
        }
      }
      return [];
    }

    // 2. ALTER TABLE ... ADD COLUMN
    const addMatch = s.match(/ALTER TABLE\s+["']?([a-zA-Z0-9_]+)["']?\s+ADD\s+(?:COLUMN\s+)?(?:IF NOT EXISTS\s+)?["']?([a-zA-Z0-9_]+)["']?/i);
    if (addMatch) {
      const tableName = addMatch[1].toLowerCase();
      const colName = addMatch[2].toLowerCase();
      if (!['constraint', 'primary', 'foreign', 'unique', 'check', 'index'].includes(colName)) {
        if (!this.tables[tableName]) this.tables[tableName] = new Set();
        this.tables[tableName].add(colName);
      }
      return [];
    }

    // 3. ALTER TABLE ... DROP COLUMN
    const dropColMatch = s.match(/ALTER TABLE\s+["']?([a-zA-Z0-9_]+)["']?\s+DROP\s+(?:COLUMN\s+)?(?:IF EXISTS\s+)?["']?([a-zA-Z0-9_]+)["']?/i);
    if (dropColMatch) {
      const tableName = dropColMatch[1].toLowerCase();
      const colName = dropColMatch[2].toLowerCase();
      if (!['constraint', 'index'].includes(colName)) {
        if (this.tables[tableName]) {
          this.tables[tableName].delete(colName);
        }
      }
      return [];
    }

    // 4. ALTER TABLE ... RENAME COLUMN
    const renameColMatch = s.match(/ALTER TABLE\s+["']?([a-zA-Z0-9_]+)["']?\s+RENAME\s+COLUMN\s+["']?([a-zA-Z0-9_]+)["']?\s+TO\s+["']?([a-zA-Z0-9_]+)["']?/i);
    if (renameColMatch) {
      const tableName = renameColMatch[1].toLowerCase();
      const oldCol = renameColMatch[2].toLowerCase();
      const newCol = renameColMatch[3].toLowerCase();
      if (this.tables[tableName]) {
        this.tables[tableName].delete(oldCol);
        this.tables[tableName].add(newCol);
      }
      return [];
    }

    // 5. DROP TABLE
    const dropTableMatch = s.match(/DROP TABLE\s+(?:IF EXISTS\s+)?(?:["']?[a-zA-Z0-9_]+["']?\.)?["']?([a-zA-Z0-9_]+)["']?/i);
    if (dropTableMatch) {
      const tableName = dropTableMatch[1].toLowerCase();
      delete this.tables[tableName];
      return [];
    }

    return [];
  }
}

export async function buildMigrationSchema(
  migrationsDir: string,
  filterFiles?: (filename: string) => boolean
): Promise<Record<string, Set<string>>> {
  let files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.ts')).sort();
  if (filterFiles) {
    files = files.filter(filterFiles);
  }

  const tracker = new MigrationSchemaTracker();
  for (const f of files) {
    const mod = await import(path.join(migrationsDir, f));
    for (const key of Object.keys(mod)) {
      if (typeof mod[key] === 'function' && mod[key].prototype && 'up' in mod[key].prototype) {
        const instance = new mod[key]();
        await instance.up(tracker);
      }
    }
  }

  return tracker.tables;
}

export function auditEntitiesAgainstSchema(
  schema: Record<string, Set<string>>,
  customEntities = entities
): string[] {
  const storage = getMetadataArgsStorage();
  const errors: string[] = [];

  for (const entityClass of customEntities) {
    const tableDef = storage.tables.find(t => t.target === entityClass);
    if (!tableDef) continue;
    const tableName = (typeof tableDef.name === 'string' ? tableDef.name : entityClass.name).toLowerCase();
    const dbCols = schema[tableName] || new Set();

    const cols = storage.columns.filter(c => c.target === entityClass);
    for (const c of cols) {
      const colName = (c.options.name || c.propertyName).toLowerCase();
      if (!dbCols.has(colName)) {
        errors.push(`Entity "${entityClass.name}" declares property "${c.propertyName}" (column "${colName}"), but table "${tableName}" does not have this column in migrations.`);
      }
    }
  }

  return errors;
}
