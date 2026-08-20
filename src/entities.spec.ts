import { test, expect, describe } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `TypeOrmModule.forFeature([X])` requests a repository provider for an
 * entity the connection is assumed to already know about — it does NOT
 * register that entity's metadata. Only `entities.ts` (passed to
 * `TypeOrmModule.forRootAsync` in app.module.ts, for both the Postgres prod
 * connection and the SQLite dev one) does that. An entity present in some
 * module's `forFeature()` but missing from `entities.ts` throws "No
 * metadata found" at boot — this has happened twice for real
 * (WorkItemAttachment, BusinessInvoiceLine). This test catches the third
 * one before it ships instead of at deploy time.
 */

const SRC_DIR = join(__dirname);

function findModuleFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findModuleFiles(full));
    else if (entry.name.endsWith('.module.ts')) out.push(full);
  }
  return out;
}

function stripLineComments(code: string): string {
  return code
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

function extractIdentifierList(raw: string): string[] {
  return stripLineComments(raw)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s));
}

function entitiesInForFeature(fileContent: string): string[] {
  const found: string[] = [];
  const re = /forFeature\(\s*\[([\s\S]*?)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(fileContent))) {
    found.push(...extractIdentifierList(match[1]));
  }
  return found;
}

function registeredEntities(): string[] {
  const content = readFileSync(join(SRC_DIR, 'entities.ts'), 'utf8');
  const match = /export const entities = \[([\s\S]*?)\];/.exec(content);
  if (!match) throw new Error('Could not find `export const entities = [...]` in entities.ts');
  return extractIdentifierList(match[1]);
}

describe('every forFeature() entity is registered in entities.ts', () => {
  const registered = new Set(registeredEntities());
  const moduleFiles = findModuleFiles(SRC_DIR);

  for (const file of moduleFiles) {
    const content = readFileSync(file, 'utf8');
    const used = entitiesInForFeature(content);
    if (!used.length) continue;
    const relative = file.slice(SRC_DIR.length + 1).replaceAll('\\', '/');
    test(`${relative}`, () => {
      const missing = used.filter((name) => !registered.has(name));
      expect(missing).toEqual([]);
    });
  }
});
