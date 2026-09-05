import { describe, expect, test } from 'bun:test';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  CROSS_CUTTING_MODULES,
  DOMAIN_CODES,
  DOMAIN_SEED,
  MODULE_DOMAIN,
} from './domains.constants';

const SRC = join(import.meta.dir, '..');

/** Top-level folders under `src/` — one per backend module, by convention. */
function moduleFolders(): string[] {
  return readdirSync(SRC).filter((name) => {
    if (name.startsWith('.')) return false;
    return statSync(join(SRC, name)).isDirectory();
  });
}

describe('domain seed', () => {
  test('covers the twelve domains of the referential, once each', () => {
    expect(DOMAIN_SEED.map((d) => d.code)).toEqual([...DOMAIN_CODES]);
  });

  test('every capability code is prefixed by its own domain', () => {
    for (const domain of DOMAIN_SEED) {
      for (const capability of domain.capabilities) {
        expect(capability.code.startsWith(`${domain.code}.C`)).toBe(true);
      }
    }
  });

  test('capability codes are globally unique', () => {
    const codes = DOMAIN_SEED.flatMap((d) => d.capabilities.map((c) => c.code));
    expect(new Set(codes).size).toBe(codes.length);
  });

  test('every domain has a purpose and at least one capability', () => {
    for (const domain of DOMAIN_SEED) {
      expect(domain.purpose.length, `${domain.code} sans finalité`).toBeGreaterThan(0);
      expect(domain.capabilities.length, `${domain.code} sans capacité`).toBeGreaterThan(0);
    }
  });
});

describe('module → domain map', () => {
  /**
   * The point of the map is that adding a module forces someone to decide
   * where it belongs. A module that is neither mapped nor declared
   * cross-cutting fails here rather than drifting unclassified.
   */
  test('every module folder is either mapped or declared cross-cutting', () => {
    const unclassified = moduleFolders().filter(
      (name) => !(name in MODULE_DOMAIN) && !CROSS_CUTTING_MODULES.includes(name),
    );
    expect(unclassified).toEqual([]);
  });

  test('no map entry points at a folder that no longer exists', () => {
    const folders = new Set(moduleFolders());
    const stale = Object.keys(MODULE_DOMAIN).filter((name) => !folders.has(name));
    expect(stale).toEqual([]);
  });

  test('every mapped domain code is a real domain', () => {
    for (const [module, code] of Object.entries(MODULE_DOMAIN)) {
      expect(DOMAIN_CODES, `${module} → ${code}`).toContain(code);
    }
  });
});
