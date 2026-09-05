import { describe, expect, mock, test } from 'bun:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { StartWorkService } from './start-work.service';
import type { WorkItem } from '../work-items/work-item.entity';
import type { WorkItemBranch } from './work-item-branch.entity';

function item(over: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 1,
    reference: 'GOV-01',
    projectId: 'p1',
    domainId: null,
    title: 'Registre canonique des entités',
    type: 'story',
    status: 'todo',
    ...over,
  } as WorkItem;
}

const REPO = {
  id: 'r1',
  owner: 'nola-studio',
  name: 'nola-hq',
  defaultBranch: 'main',
} as never;

function makeService({
  workItem = item(),
  allowed = [REPO],
  branches = [] as Partial<WorkItemBranch>[],
  branchExists = false,
  shaFails = false,
} = {}) {
  const savedItems: WorkItem[] = [];
  const savedBranches: WorkItemBranch[] = [];
  const events: { action: string; meta: Record<string, unknown> }[] = [];

  const items = {
    findOne: mock(async () => workItem),
    save: mock(async (i: WorkItem) => {
      savedItems.push({ ...i });
      return i;
    }),
  } as never;

  const branchRepo = {
    find: mock(async () => branches),
    create: mock((b: WorkItemBranch) => b),
    save: mock(async (b: WorkItemBranch) => {
      savedBranches.push(b);
      return b;
    }),
  } as never;

  const eventRepo = {
    create: mock((e: never) => e),
    save: mock(async (e: { action: string; meta: Record<string, unknown> }) => {
      events.push(e);
      return e;
    }),
  } as never;

  const repositories = {
    allowedFor: mock(async () => allowed),
    allowedForWorkItem: mock(async (scope: { projectId?: string | null; domainId?: string | null }) =>
      scope.projectId || scope.domainId ? allowed : [],
    ),
  } as never;

  const github = {
    branchSha: mock(async () => {
      if (shaFails) throw new Error('GitHub a répondu 404 : Not Found');
      return 'abc1234def';
    }),
    createBranch: mock(async () => ({ created: !branchExists })),
  } as never;

  return {
    svc: new StartWorkService(items, branchRepo, eventRepo, repositories, github),
    savedItems,
    savedBranches,
    events,
    github,
  };
}

describe('readiness', () => {
  test('un ticket éligible annonce son nom de branche avant qu’on agisse', async () => {
    const { svc } = makeService();
    const r = await svc.readiness(1);

    expect(r.ready).toBe(true);
    expect(r.branchName).toBe('feature/GOV-01-registre-canonique-des-entites');
    expect(r.repositories).toHaveLength(1);
  });

  /**
   * Chaque refus porte sa phrase et son remède. Un bouton simplement absent
   * laisserait chercher.
   */
  describe('les refus disent quoi faire', () => {
    test('un epic ne démarre pas de travail technique', async () => {
      const { svc } = makeService({ workItem: item({ type: 'epic' }) });
      const r = await svc.readiness(1);
      expect(r.blocker).toBe('not-technical');
      expect(r.reason).toContain('epic');
    });

    test('un ticket terminé', async () => {
      const { svc } = makeService({ workItem: item({ status: 'closed' }) });
      expect((await svc.readiness(1)).blocker).toBe('closed');
    });

    test('un ticket sans clé stable', async () => {
      const { svc } = makeService({ workItem: item({ reference: null }) });
      const r = await svc.readiness(1);
      expect(r.blocker).toBe('no-reference');
      expect(r.reason).toContain('clé stable');
    });

    test('un ticket sans projet ni domaine renvoie vers le rattachement', async () => {
      const { svc } = makeService({ workItem: item({ projectId: null, domainId: null }) });
      const r = await svc.readiness(1);
      expect(r.blocker).toBe('no-project');
      expect(r.reason).toContain('ni projet ni domaine');
    });

    /**
     * Les cent-six items du référentiel arrivent classés par domaine et sans
     * projet. Exiger un projet les bloquerait tous — et ce sont ceux sur
     * lesquels on veut travailler.
     */
    test('un ticket du référentiel, classé par domaine et sans projet, peut démarrer', async () => {
      const { svc } = makeService({ workItem: item({ projectId: null, domainId: 'd6' }) });
      const r = await svc.readiness(1);
      expect(r.ready).toBe(true);
      expect(r.branchName).toBe('feature/GOV-01-registre-canonique-des-entites');
    });

    test('sans dépôt dans le domaine, le message parle du domaine', async () => {
      const { svc } = makeService({ workItem: item({ projectId: null, domainId: 'd6' }), allowed: [] });
      const r = await svc.readiness(1);
      expect(r.blocker).toBe('no-repository');
      expect(r.reason).toContain('domaine');
    });

    test('un projet sans dépôt autorisé renvoie vers l’écran des dépôts', async () => {
      const { svc } = makeService({ allowed: [] });
      const r = await svc.readiness(1);
      expect(r.blocker).toBe('no-repository');
      expect(r.reason).toContain('Dépôts de code');
    });

    test('une branche déjà ouverte est nommée dans le refus', async () => {
      const { svc } = makeService({
        branches: [{ name: 'feature/GOV-01-registre', state: 'open' } as WorkItemBranch],
      });
      const r = await svc.readiness(1);
      expect(r.blocker).toBe('already-started');
      expect(r.reason).toContain('feature/GOV-01-registre');
    });

    /** Une branche fusionnée ne bloque pas : on peut repartir dessus. */
    test('une branche fusionnée ne bloque pas un nouveau départ', async () => {
      const { svc } = makeService({
        branches: [{ name: 'feature/GOV-01-vieux', state: 'merged' } as WorkItemBranch],
      });
      expect((await svc.readiness(1)).ready).toBe(true);
    });
  });

  test('readiness ne lève jamais — un ticket non éligible n’est pas une erreur', async () => {
    const { svc } = makeService({ workItem: item({ type: 'epic', reference: null, projectId: null }) });
    await expect(svc.readiness(1)).resolves.toBeDefined();
  });
});

describe('startWork', () => {
  test('crée la branche depuis la branche par défaut du dépôt', async () => {
    const { svc, savedBranches, github } = makeService();
    const res = await svc.startWork(1, {}, 'greg@nolaa.dev');

    expect(github.branchSha).toHaveBeenCalledWith('nola-studio', 'nola-hq', 'main');
    expect(github.createBranch).toHaveBeenCalledWith(
      'nola-studio',
      'nola-hq',
      'feature/GOV-01-registre-canonique-des-entites',
      'abc1234def',
    );
    expect(res.created).toBe(true);
    expect(savedBranches[0].baseBranch).toBe('main');
    expect(savedBranches[0].baseSha).toBe('abc1234def');
  });

  /** `main` bouge ; ce SHA non. C'est lui qui dit d'où le travail est parti. */
  test('le commit de départ est conservé', async () => {
    const { svc, savedBranches } = makeService();
    await svc.startWork(1, {}, 'greg@nolaa.dev');
    expect(savedBranches[0].baseSha).toBe('abc1234def');
  });

  test('le ticket passe en cours', async () => {
    const { svc, savedItems } = makeService();
    await svc.startWork(1, {}, 'greg@nolaa.dev');
    expect(savedItems[0].status).toBe('in_progress');
  });

  /**
   * Le statut ne recule jamais : une action ne doit pas défaire un état que
   * quelqu'un a fait avancer.
   */
  test('un ticket déjà en revue ne retombe pas en cours', async () => {
    const { svc, savedItems } = makeService({ workItem: item({ status: 'review' }) });
    await svc.startWork(1, {}, 'greg@nolaa.dev');
    expect(savedItems).toHaveLength(0);
  });

  test('un ticket bloqué repart en cours', async () => {
    const { svc, savedItems } = makeService({ workItem: item({ status: 'blocked' }) });
    await svc.startWork(1, {}, 'greg@nolaa.dev');
    expect(savedItems[0].status).toBe('in_progress');
  });

  /**
   * Deux personnes qui démarrent le même ticket, ou un double clic : GitHub
   * répond « already exists » et on relie plutôt que d'échouer.
   */
  test('une branche déjà présente sur GitHub est reliée, pas refusée', async () => {
    const { svc, savedBranches } = makeService({ branchExists: true });
    const res = await svc.startWork(1, {}, 'greg@nolaa.dev');

    expect(res.created).toBe(false);
    expect(savedBranches[0].createdByHq).toBe(false);
  });

  /**
   * L'ordre qui compte : GitHub d'abord, HQ ensuite. L'inverse laisserait un
   * ticket « en cours » sans branche quand le réseau lâche.
   */
  test('un échec côté GitHub ne change pas le statut du ticket', async () => {
    const { svc, savedItems, savedBranches, events } = makeService({ shaFails: true });

    await expect(svc.startWork(1, {}, 'greg@nolaa.dev')).rejects.toThrow(/404/);
    expect(savedItems).toHaveLength(0);
    expect(savedBranches).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  test('la création est tracée avec sa provenance', async () => {
    const { svc, events } = makeService();
    await svc.startWork(1, {}, 'greg@nolaa.dev');

    expect(events[0].action).toBe('branch_created');
    expect(events[0].meta).toMatchObject({
      branch: 'feature/GOV-01-registre-canonique-des-entites',
      repository: 'nola-studio/nola-hq',
      baseBranch: 'main',
      createdByHq: true,
    });
  });

  test('une branche de base explicite est respectée', async () => {
    const { svc, github } = makeService();
    await svc.startWork(1, { baseBranch: 'develop' }, 'greg@nolaa.dev');
    expect(github.branchSha).toHaveBeenCalledWith('nola-studio', 'nola-hq', 'develop');
  });

  test('le préfixe hotfix est respecté', async () => {
    const { svc, savedBranches } = makeService({ workItem: item({ type: 'bug' }) });
    await svc.startWork(1, { prefix: 'hotfix' }, 'greg@nolaa.dev');
    expect(savedBranches[0].name).toStartWith('hotfix/GOV-01-');
  });

  describe('choix du dépôt', () => {
    const SECOND = { id: 'r2', owner: 'nola-studio', name: 'nola-hq-backend', defaultBranch: 'main' } as never;

    /** Ne pas poser une question dont la réponse est unique. */
    test('un seul dépôt autorisé ⇒ aucune question', async () => {
      const { svc, savedBranches } = makeService();
      await svc.startWork(1, {}, 'greg@nolaa.dev');
      expect(savedBranches[0].repositoryId).toBe('r1');
    });

    test('plusieurs dépôts sans choix ⇒ on demande', async () => {
      const { svc } = makeService({ allowed: [REPO, SECOND] });
      await expect(svc.startWork(1, {}, 'greg@nolaa.dev')).rejects.toThrow(/précisez lequel/);
    });

    test('un choix parmi les autorisés est respecté', async () => {
      const { svc, savedBranches } = makeService({ allowed: [REPO, SECOND] });
      await svc.startWork(1, { repositoryId: 'r2' }, 'greg@nolaa.dev');
      expect(savedBranches[0].repositoryId).toBe('r2');
    });

    /**
     * La règle « seuls les dépôts autorisés sont proposés » se contournerait
     * en passant l'identifiant à la main. Elle est vérifiée côté serveur.
     */
    test('un dépôt non autorisé est refusé même passé explicitement', async () => {
      const { svc } = makeService();
      await expect(svc.startWork(1, { repositoryId: 'autre' }, 'greg@nolaa.dev')).rejects.toThrow(
        /pas autorisé/,
      );
    });
  });

  describe('refus', () => {
    test('un ticket déjà démarré est un conflit', async () => {
      const { svc } = makeService({
        branches: [{ name: 'feature/GOV-01-x', state: 'open' } as WorkItemBranch],
      });
      await expect(svc.startWork(1, {}, 'greg@nolaa.dev')).rejects.toThrow(ConflictException);
    });

    test('un epic est une demande qui n’a pas de sens', async () => {
      const { svc } = makeService({ workItem: item({ type: 'epic' }) });
      await expect(svc.startWork(1, {}, 'greg@nolaa.dev')).rejects.toThrow(BadRequestException);
    });

    test('rien n’est écrit dans GitHub quand le ticket n’est pas éligible', async () => {
      const { svc, github } = makeService({ workItem: item({ reference: null }) });
      await expect(svc.startWork(1, {}, 'greg@nolaa.dev')).rejects.toThrow();
      expect(github.createBranch).not.toHaveBeenCalled();
    });
  });
});
