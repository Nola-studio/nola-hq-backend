import { test, expect, describe } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Tout `@InjectRepository(X)` doit trouver `X` dans le `forFeature()` de son
 * module.
 *
 * Sinon Nest refuse de construire le service — « Nest can't resolve
 * dependencies of the … Please make sure that the argument
 * "XRepository" at index [n] is available in the … context » — et
 * l'application ne démarre pas du tout. C'est arrivé en production avec
 * `RoadmapInitiative` dans `ExecutionImportService` : les tests unitaires
 * construisent les services à la main, avec des dépôts simulés, et ne voient
 * donc jamais le câblage.
 *
 * Le test de fumée d'`app.module.spec.ts` ne l'attrapait pas non plus : il
 * *parcourt* le graphe des modules, il ne les *instancie* pas — or c'est
 * l'instanciation qui résout les constructeurs. L'instancier pour de vrai
 * demanderait une base de données ; cette vérification statique coûte
 * quelques millisecondes et couvre exactement le défaut qui a coûté un
 * déploiement.
 *
 * La règle est stricte parce qu'aucun module de ce dépôt ne réexporte
 * `TypeOrmModule` : un dépôt de données n'est donc jamais disponible en
 * dehors du module qui l'a déclaré.
 */

const SRC_DIR = __dirname;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

/** Les entités déclarées par les `forFeature([...])` d'un fichier de module. */
function forFeatureEntities(content: string): Set<string> {
  const found = new Set<string>();
  const re = /forFeature\(\s*\[([\s\S]*?)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(stripComments(content)))) {
    for (const raw of match[1].split(',')) {
      const name = raw.trim();
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) found.add(name);
    }
  }
  return found;
}

/** Les entités qu'un fichier réclame par `@InjectRepository(X)`. */
function injectedEntities(content: string): string[] {
  const found: string[] = [];
  const re = /@InjectRepository\(\s*([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(stripComments(content)))) found.push(match[1]);
  return found;
}

/** Le module le plus proche en remontant les dossiers — celui qui câble le service. */
function owningModule(file: string, modulesByDir: Map<string, string[]>): string[] | null {
  let dir = dirname(file);
  for (;;) {
    const modules = modulesByDir.get(dir);
    if (modules) return modules;
    if (dir === SRC_DIR || dir === '/' || dir === '.') return null;
    dir = dirname(dir);
  }
}

describe('câblage des dépôts de données', () => {
  const files = walk(SRC_DIR);

  const modulesByDir = new Map<string, string[]>();
  for (const file of files.filter((f) => f.endsWith('.module.ts'))) {
    const dir = dirname(file);
    modulesByDir.set(dir, [...(modulesByDir.get(dir) ?? []), file]);
  }

  test('chaque @InjectRepository est déclaré au forFeature de son module', () => {
    const missing: string[] = [];

    for (const file of files) {
      if (file.endsWith('.spec.ts') || file.endsWith('.module.ts')) continue;
      const injected = injectedEntities(readFileSync(file, 'utf8'));
      if (injected.length === 0) continue;

      const modules = owningModule(file, modulesByDir);
      if (!modules) continue; // Pas de module dans l'arborescence : rien à vérifier.

      const declared = new Set<string>();
      for (const m of modules) {
        for (const e of forFeatureEntities(readFileSync(m, 'utf8'))) declared.add(e);
      }

      for (const entity of injected) {
        if (!declared.has(entity)) {
          missing.push(
            `${file.replace(`${SRC_DIR}/`, '')} injecte ${entity}, absent du forFeature de ` +
              modules.map((m) => m.replace(`${SRC_DIR}/`, '')).join(', '),
          );
        }
      }
    }

    expect(missing).toEqual([]);
  });

  /**
   * Le harnais lui-même doit être capable d'échouer : une expression régulière
   * qui ne trouve plus rien rendrait le test vert pour de mauvaises raisons.
   */
  test('le lecteur reconnaît bien les deux formes', () => {
    expect(injectedEntities('@InjectRepository(WorkItem) private readonly x')).toEqual(['WorkItem']);
    expect([...forFeatureEntities('TypeOrmModule.forFeature([WorkItem, Domain])')]).toEqual([
      'WorkItem',
      'Domain',
    ]);
    // Un commentaire ne déclare rien.
    expect([...forFeatureEntities('forFeature([\n  // Domain,\n  WorkItem,\n])')]).toEqual([
      'WorkItem',
    ]);
  });
});
