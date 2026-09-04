import { describe, expect, mock, test } from 'bun:test';
import { WorkItemsService } from './work-items.service';
import type { WorkItem } from './work-item.entity';

function item(over: Partial<WorkItem>): WorkItem {
  return {
    id: 1,
    status: 'triage',
    domainId: null,
    parentId: null,
    approvedBy: null,
    closedAt: null,
    title: 't',
    ...over,
  } as WorkItem;
}

/**
 * Le service est construit positionnellement avec des dépôts factices : seuls
 * `work_items`, les évènements et les domaines interviennent dans la boîte de
 * réception, et charger tout le module Nest pour l'éprouver coûterait plus
 * cher que ce qu'on y gagnerait.
 */
function makeService(rows: WorkItem[], domains: { id: string; code: string; name: string; position: number }[] = []) {
  const saved: WorkItem[][] = [];
  const events: any[] = [];
  const repo = {
    find: mock(async (opts: any = {}) => {
      const where = opts.where ?? {};
      if (where.status) return rows.filter((r) => r.status === where.status);
      if (where.id) return rows.filter((r) => (where.id._value ?? where.id).includes(r.id));
      return rows;
    }),
    save: mock(async (batch: WorkItem[]) => {
      saved.push(batch);
      return batch;
    }),
  } as any;
  const eventRepo = {
    create: mock((e: any) => e),
    save: mock(async (e: any) => {
      events.push(...(Array.isArray(e) ? e : [e]));
      return e;
    }),
  } as any;
  const domainRepo = { find: mock(async () => domains) } as any;

  const svc = new WorkItemsService(
    repo,
    {} as any, // projects
    {} as any, // comments
    {} as any, // subtasks
    eventRepo,
    {} as any, // attachments
    {} as any, // team
    {} as any, // push
    {} as any, // planning
    domainRepo,
  );
  return { svc, saved, events };
}

describe('boîte de réception', () => {
  test('groupe par domaine, et nomme le groupe des orphelins', async () => {
    const { svc } = makeService(
      [
        item({ id: 1, domainId: 'd1' }),
        item({ id: 2, domainId: 'd1' }),
        item({ id: 3, domainId: null }),
      ],
      [{ id: 'd1', code: 'D01', name: 'Groupe et gouvernance', position: 1 }],
    );

    const inbox = await svc.inbox();

    expect(inbox.total).toBe(3);
    expect(inbox.groups.map((g) => g.code)).toEqual(['D01', 'ZZ']);
    expect(inbox.groups[0].items).toHaveLength(2);
    expect(inbox.groups[1].name).toBe('Sans domaine');
  });

  test('une boîte vide ne fabrique pas de groupe', async () => {
    const { svc } = makeService([]);
    expect(await svc.inbox()).toEqual({ total: 0, groups: [] });
  });
});

describe('acceptTriage', () => {
  test('un lot passe en todo et porte le nom de qui a décidé', async () => {
    const rows = [item({ id: 1 }), item({ id: 2 })];
    const { svc, saved, events } = makeService(rows);

    const result = await svc.acceptTriage([1, 2], 'moi@nolaa.dev');

    expect(result.accepted).toEqual([1, 2]);
    expect(result.skipped).toEqual([]);
    expect(rows.every((r) => r.status === 'todo')).toBe(true);
    expect(rows[0].approvedBy).toBe('moi@nolaa.dev');
    expect(saved[0]).toHaveLength(2);
    expect(events.map((e) => e.action)).toEqual(['accepted', 'accepted']);
  });

  /**
   * Le cœur de la garde : une sélection périmée ne doit pas ramener en `todo`
   * un ticket déjà en cours. Ce serait effacer du travail par effet de bord.
   */
  test('un ticket déjà sorti du triage est ignoré, pas ramené en arrière', async () => {
    const rows = [item({ id: 1 }), item({ id: 2, status: 'in_progress' })];
    const { svc } = makeService(rows);

    const result = await svc.acceptTriage([1, 2], 'moi@nolaa.dev');

    expect(result.accepted).toEqual([1]);
    expect(result.skipped).toEqual([{ id: 2, reason: 'Déjà sorti de la boîte de réception (« in_progress »).' }]);
    expect(rows[1].status).toBe('in_progress');
  });

  test('un id inconnu est rapporté, il ne fait pas échouer le lot', async () => {
    const { svc } = makeService([item({ id: 1 })]);
    const result = await svc.acceptTriage([1, 999], 'moi@nolaa.dev');

    expect(result.accepted).toEqual([1]);
    expect(result.skipped).toEqual([{ id: 999, reason: 'Ticket introuvable.' }]);
  });

  test('les doublons dans la sélection ne comptent qu’une fois', async () => {
    const { svc, events } = makeService([item({ id: 1 })]);
    const result = await svc.acceptTriage([1, 1, 1], 'moi@nolaa.dev');

    expect(result.accepted).toEqual([1]);
    expect(events).toHaveLength(1);
  });

  test('une sélection vide n’écrit rien', async () => {
    const { svc, saved, events } = makeService([item({ id: 1 })]);
    const result = await svc.acceptTriage([], 'moi@nolaa.dev');

    expect(result).toEqual({ accepted: [], dismissed: [], skipped: [] });
    expect(saved).toHaveLength(0);
    expect(events).toHaveLength(0);
  });
});

describe('dismissTriage', () => {
  /** Écarter n'est pas supprimer : la provenance reste, la clé stable aussi. */
  test('écarte en closed et horodate la fermeture', async () => {
    const rows = [item({ id: 1 })];
    const { svc, events } = makeService(rows);

    const result = await svc.dismissTriage([1], 'moi@nolaa.dev');

    expect(result.dismissed).toEqual([1]);
    expect(result.accepted).toEqual([]);
    expect(rows[0].status).toBe('closed');
    expect(rows[0].closedAt).toBeInstanceOf(Date);
    expect(events[0].action).toBe('dismissed');
  });
});
