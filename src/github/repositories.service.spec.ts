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

function makeService(rows: CodeRepository[] = [], projects: { id: string }[] = [{ id: 'p1' }]) {
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
    findOne: mock(async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null),
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
    find: mock(async ({ where }: any) => links.filter((l) => l.repositoryId === where.repositoryId)),
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

  return { svc: new RepositoriesService(reposRepo, linksRepo, projectsRepo), links, saved };
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
