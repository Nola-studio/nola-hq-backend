import { describe, expect, mock, test } from 'bun:test';
import { StudioProjectsProxyService } from './studio-projects-proxy.service';
import type { WorkItem } from '../work-items/work-item.entity';

/**
 * Rattacher un ticket existant à un projet (PATCH /studio/tasks/:id).
 *
 * Le projet n'était réglable qu'à la création, dans un repli « Détails »
 * fermé par défaut. Un ticket capturé au vol — ou importé avant que son
 * référentiel ne porte un projet — naissait donc sans projet et le restait :
 * « Start Work » n'avait aucun dépôt où créer sa branche, et rien dans
 * l'application ne permettait de réparer.
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
  const tasksRepo = {
    findOne: mock(async () => current),
    find: mock(async () => []),
  } as any;
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
  return { svc, workItemsMock, tasksRepo };
}

/** Ce que `update` a reçu, sans avoir à relire l'appel entier. */
function patchOf(workItemsMock: any) {
  return workItemsMock.update.mock.calls[0][1];
}

describe('rattacher un ticket à un projet', () => {
  test('le projet est transmis au work item', async () => {
    const { svc, workItemsMock } = makeService(workItem());
    await svc.updateTask('7', { projectId: 'proj-hq' } as any, 'moi@nolaa.dev');

    expect(workItemsMock.update).toHaveBeenCalled();
    expect(patchOf(workItemsMock).projectId).toBe('proj-hq');
  });

  /**
   * Un sprint appartient à un projet. Sans cette sortie, l'écriture serait
   * refusée pour incohérence — avec un message parlant du sprint, là où
   * l'utilisateur croit n'avoir touché qu'au projet.
   */
  test('changer de projet sort le ticket de son sprint', async () => {
    const { svc, workItemsMock } = makeService(
      workItem({ projectId: 'proj-ancien', sprintId: 'sprint-3' }),
    );
    await svc.updateTask('7', { projectId: 'proj-hq' } as any, 'moi@nolaa.dev');

    expect(patchOf(workItemsMock).sprintId).toBeNull();
  });

  /** Renvoyer le même projet n'est pas un changement : le sprint reste. */
  test('le même projet laisse le sprint tranquille', async () => {
    const { svc, workItemsMock } = makeService(
      workItem({ projectId: 'proj-hq', sprintId: 'sprint-3' }),
    );
    await svc.updateTask('7', { projectId: 'proj-hq' } as any, 'moi@nolaa.dev');

    expect(patchOf(workItemsMock)).not.toHaveProperty('sprintId');
  });

  test('un ticket sans sprint n’en perd aucun', async () => {
    const { svc, workItemsMock } = makeService(workItem({ projectId: 'proj-ancien' }));
    await svc.updateTask('7', { projectId: 'proj-hq' } as any, 'moi@nolaa.dev');

    expect(patchOf(workItemsMock)).not.toHaveProperty('sprintId');
  });

  /**
   * Une modification qui ne parle pas de projet ne doit ni relire le ticket
   * ni toucher à son rattachement : c'est le chemin de tous les autres
   * champs, et il passe cent fois pour une.
   */
  test('un autre champ ne relit pas le ticket et ne touche à rien', async () => {
    const { svc, workItemsMock, tasksRepo } = makeService(workItem({ projectId: 'proj-hq' }));
    await svc.updateTask('7', { title: 'Nouveau titre' } as any, 'moi@nolaa.dev');

    expect(tasksRepo.findOne).not.toHaveBeenCalled();
    const patch = patchOf(workItemsMock);
    expect(patch).not.toHaveProperty('projectId');
    expect(patch).not.toHaveProperty('sprintId');
    expect(patch.title).toBe('Nouveau titre');
  });
});
