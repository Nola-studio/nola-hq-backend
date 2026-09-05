import { describe, expect, mock, test } from 'bun:test';
import { StudioProjectsProxyService } from './studio-projects-proxy.service';
import type { WorkItem } from '../work-items/work-item.entity';

/**
 * L'estimation en points, du work item jusqu'à l'écran.
 *
 * `work_items.estimate_points` existait depuis l'origine, mais ne sortait pas
 * du proxy Studio : le tableau, la liste et le tiroir n'avaient donc rien à
 * afficher, et une estimation saisie ailleurs disparaissait de la vue de
 * l'équipe. Les deux sens comptent — la lire ne sert à rien si on ne peut pas
 * la corriger.
 */

function workItem(over: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 7,
    reference: 'US-GOV-01-1',
    projectId: null,
    sprintId: null,
    title: 'Consulter la structure du groupe',
    description: null,
    type: 'story',
    status: 'todo',
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

function makeService(current: WorkItem) {
  const tasksRepo = { findOne: mock(async () => current), find: mock(async () => []) } as any;
  const teamRepo = { find: mock(async () => []) } as any;
  const workItemsMock = {
    update: mock(async (_id: number, patch: any) => ({ ...current, ...patch })),
  } as any;
  const domainsRepo = { find: mock(async () => []) } as any;

  const nil = () => ({}) as any;
  const svc = new StudioProjectsProxyService(
    nil(), tasksRepo, teamRepo, nil(), nil(), nil(), nil(), nil(),
    nil(), nil(), nil(), nil(), nil(),
    nil(), workItemsMock, nil(), nil(),
    domainsRepo,
  );
  return { svc, workItemsMock };
}

const patchOf = (m: any) => m.update.mock.calls[0][1];

describe('l’estimation en points', () => {
  test('elle est servie à l’écran', async () => {
    const { svc } = makeService(workItem({ estimatePoints: 8 }));
    const task = await svc.updateTask('7', { title: 'Titre' } as any, 'moi@nolaa.dev');

    expect((task as { points: number }).points).toBe(8);
  });

  test('la saisir la transmet au work item', async () => {
    const { svc, workItemsMock } = makeService(workItem());
    await svc.updateTask('7', { points: 5 } as any, 'moi@nolaa.dev');

    expect(patchOf(workItemsMock).estimatePoints).toBe(5);
  });

  /**
   * `0` veut dire « pas estimé », et c'est une valeur qu'on doit pouvoir
   * reposer : un filtre naïf sur la valeur de vérité l'écarterait, laissant
   * l'ancienne estimation en place sans rien dire.
   */
  test('remettre à zéro efface l’estimation', async () => {
    const { svc, workItemsMock } = makeService(workItem({ estimatePoints: 13 }));
    await svc.updateTask('7', { points: 0 } as any, 'moi@nolaa.dev');

    expect(patchOf(workItemsMock).estimatePoints).toBe(0);
  });

  /** Modifier autre chose ne doit pas remettre l'estimation à zéro. */
  test('un autre champ ne touche pas à l’estimation', async () => {
    const { svc, workItemsMock } = makeService(workItem({ estimatePoints: 13 }));
    await svc.updateTask('7', { title: 'Nouveau titre' } as any, 'moi@nolaa.dev');

    expect(patchOf(workItemsMock)).not.toHaveProperty('estimatePoints');
  });
});
