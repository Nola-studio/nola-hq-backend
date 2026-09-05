import { describe, expect, mock, test } from 'bun:test';
import { ConflictException, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ExecutionReferencesService } from './execution-references.service';
import { MAX_REFERENCE_CONTENT_BYTES } from './execution-reference.entity';

const ACTOR = 'greg@nola.cd';

function makeService() {
  const referenceRows: any[] = [];
  const versionRows: any[] = [];
  let seq = 0;

  const references = {
    find: mock(async () => [...referenceRows]),
    findOne: mock(async ({ where }: any) => referenceRows.find((r) => r.key === where.key) ?? null),
    create: mock((r: any) => ({ ...r })),
    save: mock(async (r: any) => {
      if (!r.id) {
        r.id = `ref-${++seq}`;
        referenceRows.push(r);
      }
      return r;
    }),
  } as any;

  const versions = {
    find: mock(async ({ where }: any) => versionRows.filter((v) => v.referenceId === where.referenceId)),
    findOne: mock(async ({ where }: any) =>
      versionRows.find(
        (v) =>
          v.referenceId === where.referenceId &&
          (where.version === undefined || v.version === where.version) &&
          (where.contentHash === undefined || v.contentHash === where.contentHash),
      ) ?? null,
    ),
    create: mock((v: any) => ({ ...v })),
    save: mock(async (v: any) => {
      v.id = `ver-${++seq}`;
      versionRows.push(v);
      return v;
    }),
  } as any;

  return { svc: new ExecutionReferencesService(references, versions), references, versions, referenceRows, versionRows };
}

const BASE = {
  key: 'REF-NOLAAHQ',
  title: "Référentiel d'évolution de Nolaa HQ",
  version: '1.3',
  format: 'markdown' as const,
  content: '# Référentiel\n\n## Domaine 1\n',
};

describe('ExecutionReferencesService — dépôt initial', () => {
  test('crée la référence et sa première version en un appel', async () => {
    const { svc, versionRows } = makeService();
    const reference = await svc.create(BASE, ACTOR);

    expect(reference.key).toBe('REF-NOLAAHQ');
    expect(versionRows).toHaveLength(1);
    expect(versionRows[0].version).toBe('1.3');
    expect(versionRows[0].status).toBe('received');
  });

  test("l'empreinte est calculée côté serveur, pas déclarée par l'appelant", async () => {
    const { svc, versionRows } = makeService();
    await svc.create(BASE, ACTOR);
    const expected = createHash('sha256').update(BASE.content, 'utf8').digest('hex');
    expect(versionRows[0].contentHash).toBe(expected);
    expect(versionRows[0].sizeBytes).toBe(Buffer.byteLength(BASE.content, 'utf8'));
  });

  test('la clé est normalisée en majuscules', async () => {
    const { svc } = makeService();
    const reference = await svc.create({ ...BASE, key: '  ref-nolaahq ' }, ACTOR);
    expect(reference.key).toBe('REF-NOLAAHQ');
  });

  test("le propriétaire par défaut est celui qui dépose", async () => {
    const { svc } = makeService();
    expect((await svc.create(BASE, ACTOR)).owner).toBe(ACTOR);
    const other = makeService();
    expect((await other.svc.create({ ...BASE, owner: 'aline@nola.cd' }, ACTOR)).owner).toBe('aline@nola.cd');
  });

  test('déposer deux fois la même clé est un conflit', async () => {
    const { svc } = makeService();
    await svc.create(BASE, ACTOR);
    await expect(svc.create(BASE, ACTOR)).rejects.toThrow(ConflictException);
  });

  test('un document au-delà de la limite est refusé', async () => {
    const { svc } = makeService();
    const tooBig = 'x'.repeat(MAX_REFERENCE_CONTENT_BYTES + 1);
    await expect(svc.create({ ...BASE, content: tooBig }, ACTOR)).rejects.toThrow(PayloadTooLargeException);
  });
});

describe('ExecutionReferencesService — immuabilité de l’original', () => {
  test('une nouvelle version s’ajoute sans toucher la précédente', async () => {
    const { svc, versionRows } = makeService();
    await svc.create(BASE, ACTOR);
    await svc.addVersion('REF-NOLAAHQ', { version: '1.4', format: 'markdown', content: '# v1.4\n' }, ACTOR);

    expect(versionRows).toHaveLength(2);
    expect(versionRows[0].content).toBe(BASE.content);
    expect(versionRows.map((v) => v.version)).toEqual(['1.3', '1.4']);
  });

  /** EXE-01 : « le document original ne doit jamais être remplacé silencieusement ». */
  test('renvoyer le même numéro de version est un conflit, pas un écrasement', async () => {
    const { svc, versionRows } = makeService();
    await svc.create(BASE, ACTOR);
    await expect(
      svc.addVersion('REF-NOLAAHQ', { version: '1.3', format: 'markdown', content: '# corrigé\n' }, ACTOR),
    ).rejects.toThrow(ConflictException);
    expect(versionRows).toHaveLength(1);
    expect(versionRows[0].content).toBe(BASE.content);
  });

  test('un contenu identique sous un nouveau numéro est aussi un conflit', async () => {
    const { svc } = makeService();
    await svc.create(BASE, ACTOR);
    await expect(
      svc.addVersion('REF-NOLAAHQ', { version: '1.4', format: 'markdown', content: BASE.content }, ACTOR),
    ).rejects.toThrow(ConflictException);
  });

  test('le pointeur de dernière version suit le dernier dépôt', async () => {
    const { svc } = makeService();
    await svc.create(BASE, ACTOR);
    const v14 = await svc.addVersion(
      'REF-NOLAAHQ',
      { version: '1.4', format: 'markdown', content: '# v1.4\n' },
      ACTOR,
    );
    expect((await svc.findByKey('REF-NOLAAHQ')).latestVersionId).toBe(v14.id);
  });
});

describe('ExecutionReferencesService — lecture', () => {
  /**
   * A referential runs to tens of thousands of characters, so the guarantee
   * that matters is the projection sent to the database, not what the mock
   * happens to return. Assert the `select` itself.
   */
  test('la liste des versions ne demande jamais le contenu', async () => {
    const { svc, versions } = makeService();
    await svc.create(BASE, ACTOR);
    await svc.listVersions('REF-NOLAAHQ');

    const { select } = versions.find.mock.calls.at(-1)![0];
    expect(select).toBeDefined();
    expect(select).not.toContain('content');
    expect(select).toContain('contentHash');
  });

  test('une version inconnue est un 404', async () => {
    const { svc } = makeService();
    await svc.create(BASE, ACTOR);
    await expect(svc.findVersion('REF-NOLAAHQ', '9.9')).rejects.toThrow(NotFoundException);
  });

  test('un référentiel inconnu est un 404', async () => {
    const { svc } = makeService();
    await expect(svc.findByKey('REF-ABSENT')).rejects.toThrow(NotFoundException);
  });
});
