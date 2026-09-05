import { describe, expect, mock, test } from 'bun:test';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ReleasesService } from './releases.service';
import type { Release } from './release.entity';
import type { WorkItem } from '../work-items/work-item.entity';

/**
 * Le registre des versions (REL-00), et la cascade d'un epic vers ce qu'il
 * porte.
 *
 * Un champ texte aurait suffi à filtrer, et rien d'autre : « 1.4 », « v1.4 »
 * et « 1.4.0 » y seraient devenus trois versions, et un déploiement n'aurait
 * eu nulle part où se rattacher.
 */

function release(over: Partial<Release> = {}): Release {
  return {
    id: 'rel-14',
    version: '1.4.0',
    name: null,
    status: 'planned',
    targetDate: null,
    releasedAt: null,
    notes: null,
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-01'),
    ...over,
  } as Release;
}

function item(over: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 1,
    parentId: null,
    releaseId: null,
    status: 'todo',
    position: 0,
    updatedAt: new Date('2026-09-01'),
    ...over,
  } as WorkItem;
}

function makeService(releases: Release[] = [release()], items: WorkItem[] = []) {
  const releaseRows = [...releases];
  const itemRows = [...items];
  const updates: { ids: number[]; releaseId: string | null }[] = [];

  const releasesRepo = {
    find: mock(async ({ where }: any = {}) => {
      if (Array.isArray(where)) {
        const wanted = where.map((w: any) => w.status);
        return releaseRows.filter((r) => wanted.includes(r.status));
      }
      return releaseRows;
    }),
    findOne: mock(async ({ where }: any) =>
      releaseRows.find((r) =>
        where.version !== undefined ? r.version === where.version : r.id === where.id,
      ) ?? null,
    ),
    create: mock((r: any) => ({ id: 'rel-new', ...r })),
    save: mock(async (r: any) => {
      const at = releaseRows.findIndex((x) => x.id === r.id);
      if (at >= 0) releaseRows[at] = r;
      else releaseRows.push(r);
      return r;
    }),
    delete: mock(async () => ({ affected: 1 })),
  } as any;

  const itemsRepo = {
    find: mock(async ({ where }: any = {}) => {
      if (where?.parentId) {
        const ids = where.parentId._value ?? where.parentId;
        return itemRows.filter((i) => i.parentId !== null && ids.includes(i.parentId));
      }
      if (where?.releaseId && typeof where.releaseId === 'string') {
        return itemRows.filter((i) => i.releaseId === where.releaseId);
      }
      return itemRows.filter((i) => i.releaseId !== null);
    }),
    findOne: mock(async ({ where }: any) => itemRows.find((i) => i.id === where.id) ?? null),
    count: mock(async ({ where }: any) => itemRows.filter((i) => i.releaseId === where.releaseId).length),
    save: mock(async (i: WorkItem) => i),
    update: mock(async (where: any, patch: any) => {
      const ids = where.id._value ?? where.id;
      updates.push({ ids, releaseId: patch.releaseId });
      for (const row of itemRows) if (ids.includes(row.id)) row.releaseId = patch.releaseId;
      return { affected: ids.length };
    }),
  } as any;

  return { svc: new ReleasesService(releasesRepo, itemsRepo), releaseRows, itemRows, updates };
}

describe('le registre', () => {
  test('deux fois le même numéro est refusé', async () => {
    const { svc } = makeService();
    expect(svc.create({ version: '1.4.0' })).rejects.toThrow(ConflictException);
  });

  test('les espaces autour du numéro ne créent pas une seconde version', async () => {
    const { svc } = makeService();
    expect(svc.create({ version: '  1.4.0  ' })).rejects.toThrow(ConflictException);
  });

  /** La date de livraison se constate, elle ne se saisit pas. */
  test('passer à « livrée » date la livraison', async () => {
    const { svc } = makeService();
    const updated = await svc.update('rel-14', { status: 'released' });
    expect(updated.releasedAt).toBeInstanceOf(Date);
  });

  test('revenir en arrière efface la date', async () => {
    const { svc } = makeService([release({ status: 'released', releasedAt: new Date() })]);
    const updated = await svc.update('rel-14', { status: 'in_progress' });
    expect(updated.releasedAt).toBeNull();
  });

  /** Les annulées sortent des listes, pas de l'histoire. */
  test('les versions annulées ne sont pas proposées par défaut', async () => {
    const { svc } = makeService([release(), release({ id: 'rel-13', version: '1.3.0', status: 'cancelled' })]);
    expect((await svc.list()).map((r) => r.version)).toEqual(['1.4.0']);
    expect((await svc.list(true))).toHaveLength(2);
  });

  /**
   * Supprimer une version qui porte du travail effacerait quarante
   * rattachements au passage : ce n'est pas une suppression, c'est une
   * replanification.
   */
  test('une version qui porte des tickets ne se supprime pas', async () => {
    const { svc } = makeService([release()], [item({ releaseId: 'rel-14' })]);
    expect(svc.remove('rel-14')).rejects.toThrow(BadRequestException);
  });

  test('une version vide se supprime', async () => {
    const { svc } = makeService();
    await svc.remove('rel-14');
  });

  test('une version inconnue est un 404, pas un silence', async () => {
    const { svc } = makeService();
    expect(svc.findOne('rel-inconnue')).rejects.toThrow(NotFoundException);
  });
});

/**
 * La cascade : « la version de l'epic va jusque dans les sous-tâches ».
 */
describe('la version descend sur ce que l’epic porte', () => {
  /** epic 1 → story 2 → sous-tâche 3, plus une story 4 déplacée ailleurs. */
  const TREE = [
    item({ id: 1 }),
    item({ id: 2, parentId: 1 }),
    item({ id: 3, parentId: 2 }),
    item({ id: 4, parentId: 1, releaseId: 'rel-15' }),
  ];

  test('elle atteint les sous-tâches, pas seulement les enfants directs', async () => {
    const { svc, itemRows } = makeService([release()], TREE);
    const moved = await svc.assignToWorkItem(1, 'rel-14');

    expect(moved).toBe(2);
    expect(itemRows.find((i) => i.id === 2)?.releaseId).toBe('rel-14');
    expect(itemRows.find((i) => i.id === 3)?.releaseId).toBe('rel-14');
  });

  /** La cascade propage une règle, elle ne défait pas une décision. */
  test('un enfant déplacé ailleurs garde sa version', async () => {
    const { svc, itemRows } = makeService([release()], TREE);
    await svc.assignToWorkItem(1, 'rel-14');

    expect(itemRows.find((i) => i.id === 4)?.releaseId).toBe('rel-15');
  });

  /** Ceux qui suivaient continuent de suivre quand l'epic change de version. */
  test('changer la version de l’epic emmène ceux qui le suivaient', async () => {
    const rows = [
      item({ id: 1, releaseId: 'rel-14' }),
      item({ id: 2, parentId: 1, releaseId: 'rel-14' }),
      item({ id: 3, parentId: 1, releaseId: 'rel-15' }),
    ];
    const { svc, itemRows } = makeService(
      [release(), release({ id: 'rel-15', version: '1.5.0' })],
      rows,
    );

    await svc.assignToWorkItem(1, 'rel-15');
    expect(itemRows.find((i) => i.id === 2)?.releaseId).toBe('rel-15');
    // Celui-là y était déjà de son propre chef — rien à faire.
    expect(itemRows.find((i) => i.id === 3)?.releaseId).toBe('rel-15');
  });

  test('retirer la version de l’epic la retire aussi de sa descendance', async () => {
    const rows = [item({ id: 1, releaseId: 'rel-14' }), item({ id: 2, parentId: 1, releaseId: 'rel-14' })];
    const { svc, itemRows } = makeService([release()], rows);

    await svc.assignToWorkItem(1, null);
    expect(itemRows.find((i) => i.id === 2)?.releaseId).toBeNull();
  });

  test('reposer la même version ne touche à rien', async () => {
    const { svc, updates } = makeService([release()], [item({ id: 1, releaseId: 'rel-14' })]);
    expect(await svc.assignToWorkItem(1, 'rel-14')).toBe(0);
    expect(updates).toHaveLength(0);
  });

  test('une version inconnue est refusée avant d’écrire quoi que ce soit', async () => {
    const { svc, itemRows } = makeService([release()], [item({ id: 1 })]);
    expect(svc.assignToWorkItem(1, 'rel-inconnue')).rejects.toThrow(NotFoundException);
    expect(itemRows[0].releaseId).toBeNull();
  });
});

describe('ce que contient une version', () => {
  test('elle compte par état, et dit ce qui reste ouvert', async () => {
    const rows = [
      item({ id: 1, releaseId: 'rel-14', status: 'todo' }),
      item({ id: 2, releaseId: 'rel-14', status: 'resolved' }),
      item({ id: 3, releaseId: 'rel-14', status: 'closed' }),
      item({ id: 4, releaseId: 'rel-15', status: 'todo' }),
    ];
    const { svc } = makeService([release()], rows);

    const contents = await svc.contents('rel-14');
    expect(contents.total).toBe(3);
    expect(contents.byStatus.todo).toBe(1);
    expect(contents.remaining).toBe(1);
  });

  /** La vue « contenu » ne répète pas chaque sous-tâche sous son epic. */
  test('les tickets rendus sont les racines dans la version', async () => {
    const rows = [
      item({ id: 1, releaseId: 'rel-14' }),
      item({ id: 2, parentId: 1, releaseId: 'rel-14' }),
      item({ id: 3, parentId: 99, releaseId: 'rel-14' }),
    ];
    const { svc } = makeService([release()], rows);

    // 3 a un parent, mais hors de cette version : c'est une racine ici.
    expect((await svc.rootsOf('rel-14')).map((i) => i.id)).toEqual([1, 3]);
  });
});
