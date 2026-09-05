import { describe, expect, mock, test } from 'bun:test';
import { StudioProjectsProxyService } from './studio-projects-proxy.service';
import type { WorkItem } from '../work-items/work-item.entity';

/**
 * Un ticket issu d'un référentiel n'a ni projet ni séquence : ce qui le situe,
 * c'est son domaine (§4A) et l'epic dont il dépend. La façade Studio doit donc
 * les rendre, sinon le frontend affiche une centaine de lignes plates dont
 * rien ne dit à quoi elles se rattachent.
 */

function workItem(over: Partial<WorkItem>): WorkItem {
  return {
    id: 1,
    reference: 'GOV-01',
    projectId: null,
    sprintId: null,
    title: 'Registre canonique des entités',
    description: null,
    type: 'epic',
    status: 'triage',
    priority: 'P0',
    reporter: 'moi@nolaa.dev',
    assignee: null,
    dueDate: null,
    blockedReason: null,
    position: 0,
    estimatePoints: 0,
    category: null,
    hoursSpent: null,
    progressPercent: null,
    meetingId: null,
    createdAt: new Date('2026-09-04'),
    updatedAt: new Date('2026-09-04'),
    resolvedAt: null,
    closedAt: null,
    domainId: null,
    capabilityId: null,
    parentId: null,
    sourceKind: 'manifest',
    sourceRefId: null,
    sourceKey: null,
    sourceAuthor: null,
    sourceExcerptHash: null,
    approvedBy: null,
    ...over,
  } as WorkItem;
}

const DOMAIN = { id: 'dom-1', code: 'D01', name: 'Groupe et gouvernance' };

function makeService(items: WorkItem[], parents: WorkItem[] = []) {
  const domainsRepo = {
    find: mock(async ({ where }: any) => {
      const ids = where.id._value ?? where.id;
      return [DOMAIN].filter((d) => ids.includes(d.id));
    }),
  } as any;
  const tasksRepo = {
    find: mock(async ({ where }: any) => {
      const ids = where.id._value ?? where.id;
      return parents.filter((p) => ids.includes(p.id));
    }),
  } as any;
  const teamRepo = { find: mock(async () => []) } as any;
  const workItemsMock = {
    list: mock(async () => ({ items, total: items.length, page: 1, limit: 100 })),
  } as any;

  const nil = () => ({}) as any;
  return new StudioProjectsProxyService(
    nil(), tasksRepo, teamRepo, nil(), nil(), nil(), nil(), nil(),
    nil(), nil(), nil(), nil(), nil(),
    nil(), workItemsMock, nil(), nil(),
    domainsRepo,
  );
}

describe('enrichissement domaine / epic', () => {
  test('un epic classé rend son domaine et son type', async () => {
    const svc = makeService([workItem({ domainId: 'dom-1' })]);
    const [task] = (await svc.searchTasks({} as any)).items;

    expect(task.type).toBe('epic');
    expect(task.domain).toEqual({ code: 'D01', name: 'Groupe et gouvernance' });
    expect(task.parent).toBeNull();
  });

  test('une story rend l’epic dont elle dépend', async () => {
    const epic = workItem({ id: 1, reference: 'GOV-01' });
    const story = workItem({
      id: 2,
      reference: 'US-GOV-01-1',
      type: 'story',
      title: 'En tant que dirigeant…',
      domainId: 'dom-1',
      parentId: 1,
    });
    const svc = makeService([story], [epic]);
    const [task] = (await svc.searchTasks({} as any)).items;

    expect(task.type).toBe('story');
    expect(task.parent).toEqual({ id: '1', identifier: 'GOV-01', title: 'Registre canonique des entités' });
    expect(task.domain?.code).toBe('D01');
  });

  /** Non classé n'est pas une erreur : la classification se fait domaine par domaine. */
  test('un ticket sans domaine ni parent rend null pour les deux', async () => {
    const svc = makeService([workItem({ reference: null })]);
    const [task] = (await svc.searchTasks({} as any)).items;

    expect(task.domain).toBeNull();
    expect(task.parent).toBeNull();
    expect(task.identifier).toBeNull();
  });

  /**
   * Les libellés sont résolus une fois pour toute la page : cent tickets ne
   * doivent pas produire deux cents requêtes.
   */
  test('les libellés sont chargés une fois, pas une fois par ligne', async () => {
    const epic = workItem({ id: 1 });
    const rows = Array.from({ length: 20 }, (_, i) =>
      workItem({ id: i + 10, type: 'story', domainId: 'dom-1', parentId: 1 }),
    );
    const svc = makeService(rows, [epic]);
    const result = await svc.searchTasks({} as any);

    expect(result.items).toHaveLength(20);
    expect((svc as any).domains.find).toHaveBeenCalledTimes(1);
    expect((svc as any).tasks.find).toHaveBeenCalledTimes(1);
  });

  test('sans rien à résoudre, aucune requête de libellés n’est émise', async () => {
    const svc = makeService([workItem({})]);
    await svc.searchTasks({} as any);

    expect((svc as any).domains.find).not.toHaveBeenCalled();
    expect((svc as any).tasks.find).not.toHaveBeenCalled();
  });
});
