import { describe, expect, mock, test } from 'bun:test';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RepositoriesService } from './repositories.service';
import type { CodeRepository, RepositoryProject } from './repository.entity';

function repo(over: Partial<CodeRepository> = {}): CodeRepository {
  return {
    id: 'r1',
    provider: 'github',
    owner: 'nola-studio',
    name: 'nola-hq',
    externalId: null,
    defaultBranch: 'main',
    visibility: 'private',
    archived: false,
    htmlUrl: 'https://github.com/nola-studio/nola-hq',
    description: null,
    productId: null,
    domainId: null,
    steward: null,
    lastSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as CodeRepository;
}

function makeService(
  rows: CodeRepository[] = [],
  projects: { id: string }[] = [{ id: 'p1' }],
  discovered: unknown[] = [],
) {
  const links: RepositoryProject[] = [];
  const saved: CodeRepository[] = [];

  const reposRepo = {
    createQueryBuilder: mock(() => {
      let result = [...rows];
      const qb: any = {
        leftJoinAndSelect: () => qb,
        where: (_c: string, params: any) => {
          result = result.filter((r) => r.owner.toLowerCase() === params.owner);
          return qb;
        },
        andWhere: (clause: string, params: any) => {
          if (clause.includes('LOWER(r.name)')) result = result.filter((r) => r.name.toLowerCase() === params.name);
          if (clause.includes('r.archived')) result = result.filter((r) => r.archived === params.archived);
          if (clause.includes('repository_projects')) {
            result = result.filter((r) => links.some((l) => l.repositoryId === r.id && l.projectId === params.projectId));
          }
          return qb;
        },
        orderBy: () => qb,
        addOrderBy: () => qb,
        getMany: async () => result,
        getOne: async () => result[0] ?? null,
      };
      return qb;
    }),
    findOne: mock(async ({ where }: any) =>
      rows.find((r) =>
        where.externalId !== undefined ? r.externalId === where.externalId : r.id === where.id,
      ) ?? null,
    ),
    create: mock((r: any) => ({ id: 'r-new', ...r })),
    save: mock(async (r: any) => {
      saved.push(r);
      return r;
    }),
  } as any;

  const linksRepo = {
    findOne: mock(async ({ where }: any) =>
      links.find((l) => l.repositoryId === where.repositoryId && l.projectId === where.projectId) ?? null,
    ),
    // `withProjectIds` interroge par lot (`In([...])`), les autres par dépôt.
    find: mock(async ({ where }: any) => {
      const ids = where.repositoryId?._value ?? where.repositoryId;
      const wanted = Array.isArray(ids) ? ids : [ids];
      return links.filter((l) => wanted.includes(l.repositoryId));
    }),
    create: mock((l: any) => ({ id: `l${links.length + 1}`, ...l })),
    save: mock(async (l: any) => {
      links.push(l);
      return l;
    }),
    delete: mock(async (where: any) => {
      const before = links.length;
      for (let i = links.length - 1; i >= 0; i--) {
        if (links[i].repositoryId === where.repositoryId && links[i].projectId === where.projectId) links.splice(i, 1);
      }
      return { affected: before - links.length };
    }),
  } as any;

  const projectsRepo = {
    findOne: mock(async ({ where }: any) => projects.find((p) => p.id === where.id) ?? null),
    find: mock(async ({ where }: any) => {
      const ids = where.id._value ?? where.id;
      return projects.filter((p) => ids.includes(p.id));
    }),
  } as any;

  const github = {
    listInstallationRepositories: mock(async () => discovered),
    fetchRepository: mock(async () => ({
      externalId: '987654321',
      owner: 'nola-studio',
      name: 'nola-hq',
      defaultBranch: 'trunk',
      visibility: 'public' as const,
      archived: false,
      htmlUrl: 'https://github.com/nola-studio/nola-hq',
      description: 'Console Nolaa HQ',
    })),
  } as any;

  return { svc: new RepositoriesService(reposRepo, linksRepo, projectsRepo, github), links, saved, github };
}

describe('register', () => {
  test('accepte une URL et en tire owner/name', async () => {
    const { svc, saved } = makeService();
    await svc.register({ ref: 'https://github.com/nola-studio/nola-hq.git' });

    expect(saved[0].owner).toBe('nola-studio');
    expect(saved[0].name).toBe('nola-hq');
    expect(saved[0].htmlUrl).toBe('https://github.com/nola-studio/nola-hq');
  });

  /** Une saisie fautive doit dire pourquoi, pas produire un 404 GitHub plus tard. */
  test('une référence invalide est un 400 explicite', async () => {
    const { svc } = makeService();
    await expect(svc.register({ ref: 'nola-hq' })).rejects.toThrow(BadRequestException);
    await expect(svc.register({ ref: 'nola-hq' })).rejects.toThrow(/owner\/name/);
  });

  test('un dépôt déjà enregistré est refusé, sans distinguer la casse', async () => {
    const { svc } = makeService([repo()]);
    await expect(svc.register({ ref: 'Nola-Studio/Nola-HQ' })).rejects.toThrow(ConflictException);
  });

  /**
   * `main` est une supposition tant que GitHub n'a rien déclaré. On la pose
   * pour que l'objet soit utilisable, pas pour prétendre la connaître —
   * d'où `lastSyncedAt` à null.
   */
  test('la branche par défaut est main, et rien n’est marqué synchronisé', async () => {
    const { svc, saved } = makeService();
    await svc.register({ ref: 'nola-studio/nola-hq' });

    expect(saved[0].defaultBranch).toBe('main');
    expect(saved[0].lastSyncedAt).toBeNull();
  });

  test('la branche par défaut peut être donnée à l’enregistrement', async () => {
    const { svc, saved } = makeService();
    await svc.register({ ref: 'nola-studio/legacy', defaultBranch: 'master' });
    expect(saved[0].defaultBranch).toBe('master');
  });
});

describe('allowedFor', () => {
  /**
   * La règle d'ENG-08 : seuls les dépôts autorisés pour le projet sont
   * proposés. Une liste vide est une réponse — proposer tout le catalogue
   * serait précisément ce que la règle interdit.
   */
  test('un projet sans dépôt déclaré n’en reçoit aucun, pas tout le catalogue', async () => {
    const { svc } = makeService([repo(), repo({ id: 'r2', name: 'nola-hq-backend' })]);
    expect(await svc.allowedFor('p1')).toEqual([]);
  });

  test('un projet reçoit les dépôts qu’on lui a rattachés', async () => {
    const { svc } = makeService([repo(), repo({ id: 'r2', name: 'nola-hq-backend' })]);
    await svc.linkProject('r1', { projectId: 'p1' });

    const allowed = await svc.allowedFor('p1');
    expect(allowed.map((r) => r.id)).toEqual(['r1']);
  });

  test('un projet inconnu est un 404, pas une liste vide', async () => {
    const { svc } = makeService([repo()]);
    await expect(svc.allowedFor('inconnu')).rejects.toThrow(NotFoundException);
  });
});

describe('linkProject', () => {
  test('rattacher deux fois ne crée pas de doublon', async () => {
    const { svc, links } = makeService([repo()]);
    await svc.linkProject('r1', { projectId: 'p1' });
    await svc.linkProject('r1', { projectId: 'p1' });

    expect(links).toHaveLength(1);
  });

  test('un dépôt archivé n’accepte pas de nouveau projet', async () => {
    const { svc } = makeService([repo({ archived: true })]);
    await expect(svc.linkProject('r1', { projectId: 'p1' })).rejects.toThrow(/archivé/);
  });

  test('un projet inconnu est refusé', async () => {
    const { svc } = makeService([repo()]);
    await expect(svc.linkProject('r1', { projectId: 'nope' })).rejects.toThrow(NotFoundException);
  });

  test('détacher un projet qui n’est pas rattaché est un 404', async () => {
    const { svc } = makeService([repo()]);
    await expect(svc.unlinkProject('r1', 'p1')).rejects.toThrow(NotFoundException);
  });
});

describe('archive', () => {
  /** Archiver, pas supprimer : les liens qui expliquent une branche restent. */
  test('marque archivé sans rien effacer', async () => {
    const { svc, saved } = makeService([repo()]);
    await svc.linkProject('r1', { projectId: 'p1' });
    await svc.archive('r1');

    expect(saved.at(-1)!.archived).toBe(true);
    expect(await svc.projectsOf('r1')).toHaveLength(1);
  });
});

describe('list', () => {
  test('les archivés sont exclus par défaut', async () => {
    const { svc } = makeService([repo(), repo({ id: 'r2', name: 'vieux', archived: true })]);
    expect((await svc.list()).map((r) => r.id)).toEqual(['r1']);
  });

  test('on peut les demander', async () => {
    const { svc } = makeService([repo(), repo({ id: 'r2', name: 'vieux', archived: true })]);
    expect((await svc.list({ includeArchived: true })).map((r) => r.id)).toEqual(['r1', 'r2']);
  });
});

describe('sync', () => {
  /** GitHub fait autorité sur ces champs-là ; HQ les reflète. */
  test('reprend la branche par défaut, la visibilité et la description', async () => {
    const { svc } = makeService([repo()]);
    const synced = await svc.sync('r1');

    expect(synced.defaultBranch).toBe('trunk');
    expect(synced.visibility).toBe('public');
    expect(synced.description).toBe('Console Nolaa HQ');
    expect(synced.externalId).toBe('987654321');
    expect(synced.lastSyncedAt).toBeInstanceOf(Date);
  });

  /** Et il ne touche pas à ce que HQ est seul à savoir. */
  test('ne touche ni au produit, ni au domaine, ni au responsable', async () => {
    const { svc } = makeService([
      repo({ productId: 'prod-1', domainId: 'dom-1', steward: 'greg@nolaa.dev' }),
    ]);
    const synced = await svc.sync('r1');

    expect(synced.productId).toBe('prod-1');
    expect(synced.domainId).toBe('dom-1');
    expect(synced.steward).toBe('greg@nolaa.dev');
  });

  /**
   * Un `external_id` différent veut dire que `owner/name` désigne maintenant
   * un autre dépôt — transfert, suppression puis recréation. Écraser
   * silencieusement ferait pointer tout l'historique de HQ vers un inconnu.
   */
  test('un dépôt remplacé sous le même nom est un conflit, pas une mise à jour', async () => {
    const { svc } = makeService([repo({ externalId: '111' })]);
    await expect(svc.sync('r1')).rejects.toThrow(ConflictException);
    await expect(svc.sync('r1')).rejects.toThrow(/111 → 987654321/);
  });

  test('un dépôt jamais synchronisé accepte l’identifiant qu’on lui découvre', async () => {
    const { svc } = makeService([repo({ externalId: null })]);
    expect((await svc.sync('r1')).externalId).toBe('987654321');
  });

  /** Archivé sur GitHub l'est ici ; archivé ici est une décision locale. */
  test('l’archivage descend de GitHub, il ne remonte pas', async () => {
    const { svc, github } = makeService([repo({ archived: true })]);
    github.fetchRepository = mock(async () => ({
      externalId: '987654321', owner: 'nola-studio', name: 'nola-hq', defaultBranch: 'main',
      visibility: 'private' as const, archived: false, htmlUrl: 'u', description: null,
    }));

    expect((await svc.sync('r1')).archived).toBe(true);
  });

  test('un dépôt renommé sur GitHub suit son nouveau nom', async () => {
    const { svc, github } = makeService([repo({ externalId: '987654321', name: 'ancien-nom' })]);
    github.fetchRepository = mock(async () => ({
      externalId: '987654321', owner: 'nola-studio', name: 'nouveau-nom', defaultBranch: 'main',
      visibility: 'private' as const, archived: false, htmlUrl: 'u', description: null,
    }));

    expect((await svc.sync('r1')).name).toBe('nouveau-nom');
  });
});

const FACTS = {
  externalId: '987654321',
  owner: 'nola-studio',
  name: 'nola-hq',
  defaultBranch: 'main',
  visibility: 'private' as const,
  archived: false,
  htmlUrl: 'https://github.com/nola-studio/nola-hq',
  description: 'Console Nolaa HQ',
};

describe('discover', () => {
  /** C'est GitHub qui sait à quoi il donne accès — on le lui demande. */
  test('enregistre les dépôts que l’App peut voir', async () => {
    const { svc, saved } = makeService([], [{ id: 'p1' }], [FACTS]);
    const res = await svc.discover();

    expect(res.added).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      owner: 'nola-studio',
      name: 'nola-hq',
      externalId: '987654321',
      defaultBranch: 'main',
    });
    expect(saved[0].lastSyncedAt).toBeInstanceOf(Date);
  });

  /** Relancer la découverte ne doit pas dupliquer ce qui est déjà connu. */
  test('un dépôt déjà connu est rafraîchi, pas dupliqué', async () => {
    const known = repo({ externalId: '987654321', defaultBranch: 'master' });
    const { svc } = makeService([known], [{ id: 'p1' }], [FACTS]);
    const res = await svc.discover();

    expect(res.added).toHaveLength(0);
    expect(res.updated).toHaveLength(1);
    expect(known.defaultBranch).toBe('main');
  });

  test('un dépôt inchangé est compté comme tel', async () => {
    const known = repo({ ...FACTS });
    const { svc } = makeService([known], [{ id: 'p1' }], [FACTS]);
    const res = await svc.discover();

    expect(res.updated).toHaveLength(0);
    expect(res.unchanged).toBe(1);
  });

  /**
   * Un dépôt enregistré à la main n'a pas encore d'identifiant GitHub : il
   * doit être reconnu par son nom, pas dupliqué.
   */
  test('un dépôt saisi à la main est reconnu par son nom et reçoit son identifiant', async () => {
    const known = repo({ externalId: null });
    const { svc } = makeService([known], [{ id: 'p1' }], [FACTS]);
    const res = await svc.discover();

    expect(res.added).toHaveLength(0);
    expect(known.externalId).toBe('987654321');
  });

  /** Ce que HQ est seul à savoir n'appartient pas à GitHub. */
  test('le produit, le domaine et le responsable ne sont jamais écrasés', async () => {
    const known = repo({
      externalId: '987654321',
      productId: 'prod-1',
      domainId: 'dom-6',
      steward: 'greg@nolaa.dev',
    });
    const { svc } = makeService([known], [{ id: 'p1' }], [FACTS]);
    await svc.discover();

    expect(known.productId).toBe('prod-1');
    expect(known.domainId).toBe('dom-6');
    expect(known.steward).toBe('greg@nolaa.dev');
  });

  /** L'archivage descend de GitHub, il ne remonte pas. */
  test('un dépôt archivé dans HQ le reste', async () => {
    const known = repo({ externalId: '987654321', archived: true });
    const { svc } = makeService([known], [{ id: 'p1' }], [FACTS]);
    await svc.discover();

    expect(known.archived).toBe(true);
  });

  test('sans App installée, rien n’est enregistré', async () => {
    const { svc, saved } = makeService([], [{ id: 'p1' }], []);
    const res = await svc.discover();

    expect(res).toEqual({ added: [], updated: [], unchanged: 0 });
    expect(saved).toHaveLength(0);
  });
});

/**
 * Les projets rattachés voyagent avec le dépôt.
 *
 * L'écran connaît déjà la liste des projets ; il ne lui manque que de savoir
 * lesquels sont rattachés à quel dépôt. Le lui dire ici évite une requête par
 * ligne — vingt dépôts, vingt allers-retours pour afficher des étiquettes.
 */
describe('projets rattachés', () => {
  test('la liste porte les projets de chaque dépôt', async () => {
    const second = repo({ id: 'r2', name: 'nola-hq-backend' });
    const { svc } = makeService([repo(), second], [{ id: 'p1' }, { id: 'p2' }]);

    await svc.linkProject('r1', { projectId: 'p1' });
    await svc.linkProject('r1', { projectId: 'p2' });
    await svc.linkProject('r2', { projectId: 'p2' });

    const rows = await svc.list();
    expect(rows.find((r) => r.id === 'r1')?.projectIds?.sort()).toEqual(['p1', 'p2']);
    expect(rows.find((r) => r.id === 'r2')?.projectIds).toEqual(['p2']);
  });

  /** Aucun rattachement est une réponse, pas une absence de réponse. */
  test('un dépôt sans projet rend un tableau vide', async () => {
    const { svc } = makeService([repo()]);
    const [row] = await svc.list();
    expect(row.projectIds).toEqual([]);
  });

  test('le détail d’un dépôt les porte aussi', async () => {
    const { svc } = makeService([repo()]);
    await svc.linkProject('r1', { projectId: 'p1' });

    expect((await svc.findOne('r1')).projectIds).toEqual(['p1']);
  });

  /** Détacher se voit tout de suite dans la liste. */
  test('un projet détaché disparaît de la liste', async () => {
    const { svc } = makeService([repo()]);
    await svc.linkProject('r1', { projectId: 'p1' });
    await svc.unlinkProject('r1', 'p1');

    expect((await svc.list())[0].projectIds).toEqual([]);
  });
});
