import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueryFailedError } from 'typeorm';
import { GithubWebhooksService } from './github-webhooks.service';
import type { GithubWebhookDelivery } from './github-webhook-delivery.entity';

const SECRET = 'un-secret-de-test';

beforeEach(() => {
  process.env.GITHUB_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.GITHUB_WEBHOOK_SECRET;
});

function body(payload: unknown): Buffer {
  return Buffer.from(JSON.stringify(payload), 'utf8');
}

function sign(raw: Buffer, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
}

const PUSH = {
  ref: 'refs/heads/feature/GOV-01-registre',
  repository: { id: 987654321, full_name: 'nola-studio/nola-hq' },
  pusher: { name: 'greg' },
};

function makeService({
  repos = [] as any[],
  duplicate = false,
  branches = [] as any[],
  items = [] as any[],
} = {}) {
  const rows: GithubWebhookDelivery[] = [];
  const deliveries = {
    create: mock((r: any) => ({ ...r })),
    save: mock(async (r: any) => {
      if (duplicate) {
        const err = new QueryFailedError('insert', [], new Error('dup') as any);
        (err as any).driverError = { code: '23505' };
        throw err;
      }
      rows.push(r);
      return r;
    }),
    find: mock(async () => rows),
  } as any;

  const repositories = {
    findOne: mock(async ({ where }: any) => repos.find((r) => r.externalId === where.externalId) ?? null),
    createQueryBuilder: mock(() => {
      let result = [...repos];
      const qb: any = {
        where: (_c: string, p: any) => {
          result = result.filter((r) => r.owner.toLowerCase() === p.owner);
          return qb;
        },
        andWhere: (_c: string, p: any) => {
          result = result.filter((r) => r.name.toLowerCase() === p.name);
          return qb;
        },
        getOne: async () => result[0] ?? null,
      };
      return qb;
    }),
  } as any;

  const branchRows: any[] = [...branches];
  const branchRepo = {
    findOne: mock(async ({ where }: any) =>
      branchRows.find((b) => b.repositoryId === where.repositoryId && b.name === where.name) ?? null,
    ),
    create: mock((b: any) => b),
    save: mock(async (b: any) => {
      branchRows.push(b);
      return b;
    }),
    update: mock(async (where: any, patch: any) => {
      let affected = 0;
      for (const b of branchRows) {
        if (
          b.repositoryId === where.repositoryId &&
          b.name === where.name &&
          (!where.state || b.state === where.state)
        ) {
          Object.assign(b, patch);
          affected += 1;
        }
      }
      return { affected };
    }),
  } as any;

  const itemRows = [...items];
  const itemRepo = {
    count: mock(async ({ where }: any) => itemRows.filter((i) => i.reference === where.reference).length),
    findOne: mock(async ({ where }: any) => itemRows.find((i) => i.reference === where.reference) ?? null),
  } as any;

  const eventRows: any[] = [];
  const eventRepo = {
    create: mock((e: any) => e),
    save: mock(async (e: any) => {
      eventRows.push(e);
      return e;
    }),
  } as any;

  return {
    svc: new GithubWebhooksService(
      deliveries,
      repositories,
      branchRepo,
      itemRepo,
      eventRepo,
      new ConfigService(),
    ),
    rows,
    branchRows,
    itemRows,
    eventRows,
  };
}

const KNOWN = { id: 'r1', owner: 'nola-studio', name: 'nola-hq', externalId: '987654321' };

describe('refus', () => {
  test('une signature absente est refusée, et rien n’est écrit', async () => {
    const { svc, rows } = makeService();
    await expect(
      svc.receive({ rawBody: body(PUSH), signature: undefined, deliveryId: 'd1', event: 'push' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(rows).toHaveLength(0);
  });

  test('une signature d’un autre secret est refusée', async () => {
    const { svc, rows } = makeService();
    const raw = body(PUSH);
    await expect(
      svc.receive({ rawBody: raw, signature: sign(raw, 'autre'), deliveryId: 'd1', event: 'push' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(rows).toHaveLength(0);
  });

  /**
   * Le point qui compte pour la sécurité de l'endpoint : une charge utile non
   * authentifiée n'entre jamais en base. Sinon l'adresse, qui est publique,
   * devient un moyen de remplir le disque.
   */
  test('un corps non authentifié n’est jamais conservé', async () => {
    const { svc, rows } = makeService();
    const gros = body({ repository: { full_name: 'x/y' }, bourrage: 'a'.repeat(100_000) });
    await expect(
      svc.receive({ rawBody: gros, signature: 'sha256=deadbeef', deliveryId: 'd1', event: 'push' }),
    ).rejects.toThrow();
    expect(rows).toHaveLength(0);
  });

  /** Pas de secret configuré ne veut pas dire « accepter tout le monde ». */
  test('sans secret configuré, même une livraison bien formée est refusée', async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    const { svc } = makeService();
    const raw = body(PUSH);
    await expect(
      svc.receive({ rawBody: raw, signature: sign(raw), deliveryId: 'd1', event: 'push' }),
    ).rejects.toThrow(/ne sont pas configurés/);
  });

  test('sans identifiant de livraison, refus — la déduplication en dépend', async () => {
    const { svc } = makeService();
    const raw = body(PUSH);
    await expect(
      svc.receive({ rawBody: raw, signature: sign(raw), deliveryId: undefined, event: 'push' }),
    ).rejects.toThrow(/X-GitHub-Delivery/);
  });

  /**
   * La réponse ne distingue pas « absente » de « invalide » : le dire
   * apprendrait à un inconnu qu'il a trouvé la bonne forme.
   */
  test('les refus de signature se ressemblent tous vus du dehors', async () => {
    const { svc } = makeService();
    const raw = body(PUSH);
    const messages: string[] = [];
    for (const signature of [undefined, 'bidon', 'sha256=zz', sign(raw, 'autre')]) {
      await svc
        .receive({ rawBody: raw, signature, deliveryId: 'd1', event: 'push' })
        .catch((e) => messages.push(e.message));
    }
    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).toBe('Signature absente.');
  });
});

describe('réception', () => {
  test('une livraison signée sur un dépôt connu est conservée', async () => {
    const { svc, rows } = makeService({ repos: [KNOWN] });
    const raw = body(PUSH);

    const out = await svc.receive({ rawBody: raw, signature: sign(raw), deliveryId: 'd1', event: 'push' });

    expect(out).toEqual({ status: 'received', deliveryId: 'd1' });
    expect(rows[0].repositoryId).toBe('r1');
    expect(rows[0].event).toBe('push');
    expect(rows[0].repositorySlug).toBe('nola-studio/nola-hq');
  });

  test('l’action est reprise quand l’événement en porte une', async () => {
    const { svc, rows } = makeService({ repos: [KNOWN] });
    const raw = body({ ...PUSH, action: 'opened' });

    await svc.receive({ rawBody: raw, signature: sign(raw), deliveryId: 'd1', event: 'pull_request' });
    expect(rows[0].action).toBe('opened');
  });

  /**
   * L'App peut être installée sur un dépôt que HQ ne suit pas. Ce n'est ni
   * une erreur ni un refus : on conserve, on marque, on n'agit pas.
   */
  test('un dépôt absent du registre est conservé et marqué « ignored »', async () => {
    const { svc, rows } = makeService({ repos: [] });
    const raw = body(PUSH);

    const out = await svc.receive({ rawBody: raw, signature: sign(raw), deliveryId: 'd1', event: 'push' });

    expect(out.status).toBe('ignored');
    expect(out.detail).toContain('absent du registre');
    expect(rows[0].repositoryId).toBeNull();
    expect(rows[0].repositorySlug).toBe('nola-studio/nola-hq');
  });

  /** Un dépôt renommé garde son identifiant : c'est lui qui le reconnaît. */
  test('le dépôt est reconnu par son identifiant même sous un autre nom', async () => {
    const { svc, rows } = makeService({ repos: [{ ...KNOWN, name: 'ancien-nom' }] });
    const raw = body(PUSH);

    await svc.receive({ rawBody: raw, signature: sign(raw), deliveryId: 'd1', event: 'push' });
    expect(rows[0].repositoryId).toBe('r1');
  });

  test('un dépôt sans identifiant connu est retrouvé par son nom', async () => {
    const { svc, rows } = makeService({
      repos: [{ id: 'r1', owner: 'Nola-Studio', name: 'Nola-HQ', externalId: null }],
    });
    const raw = body(PUSH);

    await svc.receive({ rawBody: raw, signature: sign(raw), deliveryId: 'd1', event: 'push' });
    expect(rows[0].repositoryId).toBe('r1');
  });

  test('un événement sans dépôt (ping) est conservé sans rattachement', async () => {
    const { svc, rows } = makeService();
    const raw = body({ zen: 'Non-blocking is better than blocking.' });

    const out = await svc.receive({ rawBody: raw, signature: sign(raw), deliveryId: 'd1', event: 'ping' });

    expect(out.status).toBe('ignored');
    expect(rows[0].event).toBe('ping');
    expect(rows[0].repositorySlug).toBeNull();
  });
});

describe('déduplication', () => {
  /**
   * GitHub rejoue toute livraison qui n'a pas répondu 200. Sans cela, une
   * coupure réseau deviendrait un doublon — et, le jour où ces événements
   * feront avancer un ticket, une transition comptée deux fois.
   */
  test('un rejeu répond « duplicate » sans lever ni réécrire', async () => {
    const { svc } = makeService({ repos: [KNOWN], duplicate: true });
    const raw = body(PUSH);

    const out = await svc.receive({ rawBody: raw, signature: sign(raw), deliveryId: 'd1', event: 'push' });
    expect(out).toEqual({ status: 'duplicate', deliveryId: 'd1' });
  });

  /** Une autre erreur de base ne doit pas se faire passer pour un doublon. */
  test('une erreur de base qui n’est pas un doublon remonte', async () => {
    const deliveries = {
      create: mock((r: any) => r),
      save: mock(async () => {
        const err = new QueryFailedError('insert', [], new Error('boom') as any);
        (err as any).driverError = { code: '42P01' };
        throw err;
      }),
    } as any;
    const svc = new GithubWebhooksService(
      deliveries,
      {
        findOne: async () => null,
        createQueryBuilder: () => ({
          where: () => ({ andWhere: () => ({ getOne: async () => null }) }),
        }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      new ConfigService(),
    );
    const raw = body(PUSH);

    await expect(
      svc.receive({ rawBody: raw, signature: sign(raw), deliveryId: 'd1', event: 'push' }),
    ).rejects.toThrow(QueryFailedError);
  });
});

const TICKET = { id: 42, reference: 'GOV-01' };
const KNOWN_REPO = { id: 'r1', owner: 'nola-studio', name: 'nola-hq', externalId: '987654321', defaultBranch: 'main' };

function deliver(
  svc: GithubWebhooksService,
  event: string,
  payload: Record<string, unknown>,
  deliveryId = `d-${Math.random()}`,
) {
  const raw = body({ repository: { id: 987654321, full_name: 'nola-studio/nola-hq' }, ...payload });
  return svc.receive({ rawBody: raw, signature: sign(raw), deliveryId, event });
}

describe('une branche poussée depuis un terminal', () => {
  /**
   * La moitié automatique d'ENG-08 : la convention de nommage ne sert à rien
   * si seul le bouton sait s'en servir.
   */
  test('est reconnue et rattachée à son ticket', async () => {
    const { svc, branchRows } = makeService({ repos: [KNOWN_REPO], items: [TICKET] });

    await deliver(svc, 'create', { ref_type: 'branch', ref: 'feature/GOV-01-registre-canonique' });

    expect(branchRows).toHaveLength(1);
    expect(branchRows[0]).toMatchObject({
      workItemId: 42,
      name: 'feature/GOV-01-registre-canonique',
      state: 'open',
      createdBy: 'github',
    });
  });

  /** Reconnue, pas créée — la provenance ne se devine pas après coup. */
  test('est marquée comme reconnue, pas comme créée par HQ', async () => {
    const { svc, branchRows } = makeService({ repos: [KNOWN_REPO], items: [TICKET] });
    await deliver(svc, 'create', { ref_type: 'branch', ref: 'feature/GOV-01-x' });
    expect(branchRows[0].createdByHq).toBe(false);
  });

  test('la reconnaissance est tracée dans l’historique du ticket', async () => {
    const { svc, eventRows } = makeService({ repos: [KNOWN_REPO], items: [TICKET] });
    await deliver(svc, 'create', { ref_type: 'branch', ref: 'feature/GOV-01-x' });

    expect(eventRows[0]).toMatchObject({ workItemId: 42, actor: 'github', action: 'branch_created' });
  });

  /** La user story l'emporte sur l'epic dont elle porte la clé. */
  test('la clé la plus longue gagne', async () => {
    const { svc, branchRows } = makeService({
      repos: [KNOWN_REPO],
      items: [{ id: 1, reference: 'US-GOV-01' }, { id: 2, reference: 'US-GOV-01-1' }],
    });

    await deliver(svc, 'create', { ref_type: 'branch', ref: 'feature/US-GOV-01-1-consulter' });
    expect(branchRows[0].workItemId).toBe(2);
  });

  test('une branche sans clé connue n’est pas rattachée', async () => {
    const { svc, branchRows } = makeService({ repos: [KNOWN_REPO], items: [TICKET] });

    await deliver(svc, 'create', { ref_type: 'branch', ref: 'feature/refonte-du-menu' });
    await deliver(svc, 'create', { ref_type: 'branch', ref: 'feature/ZZZ-99-inconnu' });

    expect(branchRows).toHaveLength(0);
  });

  /** Celle que « Start Work » vient de créer arrive aussi par webhook. */
  test('une branche déjà liée n’est pas dupliquée', async () => {
    const { svc, branchRows } = makeService({
      repos: [KNOWN_REPO],
      items: [TICKET],
      branches: [{ repositoryId: 'r1', name: 'feature/GOV-01-x', state: 'open' }],
    });

    await deliver(svc, 'create', { ref_type: 'branch', ref: 'feature/GOV-01-x' });
    expect(branchRows).toHaveLength(1);
  });

  test('une étiquette créée n’est pas une branche', async () => {
    const { svc, branchRows } = makeService({ repos: [KNOWN_REPO], items: [TICKET] });
    await deliver(svc, 'create', { ref_type: 'tag', ref: 'v1.2.3' });
    expect(branchRows).toHaveLength(0);
  });
});

describe('une branche supprimée', () => {
  /** Le lien n'est jamais effacé : son historique reste. */
  test('passe à « deleted » sans disparaître', async () => {
    const { svc, branchRows } = makeService({
      repos: [KNOWN_REPO],
      branches: [{ repositoryId: 'r1', name: 'feature/GOV-01-x', state: 'open' }],
    });

    await deliver(svc, 'delete', { ref_type: 'branch', ref: 'feature/GOV-01-x' });

    expect(branchRows).toHaveLength(1);
    expect(branchRows[0].state).toBe('deleted');
  });

  /** Fusionnée est plus précis que supprimée : on ne recule pas. */
  test('une branche déjà fusionnée le reste', async () => {
    const { svc, branchRows } = makeService({
      repos: [KNOWN_REPO],
      branches: [{ repositoryId: 'r1', name: 'feature/GOV-01-x', state: 'merged' }],
    });

    await deliver(svc, 'delete', { ref_type: 'branch', ref: 'feature/GOV-01-x' });
    expect(branchRows[0].state).toBe('merged');
  });
});

describe('une pull request', () => {
  test('fusionnée marque sa branche comme fusionnée', async () => {
    const { svc, branchRows } = makeService({
      repos: [KNOWN_REPO],
      branches: [{ repositoryId: 'r1', name: 'feature/GOV-01-x', state: 'open' }],
    });

    await deliver(svc, 'pull_request', {
      action: 'closed',
      pull_request: { merged: true, head: { ref: 'feature/GOV-01-x' } },
    });

    expect(branchRows[0].state).toBe('merged');
  });

  /** Fermée sans fusion : la branche existe encore, le travail peut reprendre. */
  test('fermée sans fusion ne change rien', async () => {
    const { svc, branchRows } = makeService({
      repos: [KNOWN_REPO],
      branches: [{ repositoryId: 'r1', name: 'feature/GOV-01-x', state: 'open' }],
    });

    await deliver(svc, 'pull_request', {
      action: 'closed',
      pull_request: { merged: false, head: { ref: 'feature/GOV-01-x' } },
    });

    expect(branchRows[0].state).toBe('open');
  });

  test('ouverte ne change rien non plus', async () => {
    const { svc, branchRows } = makeService({
      repos: [KNOWN_REPO],
      branches: [{ repositoryId: 'r1', name: 'feature/GOV-01-x', state: 'open' }],
    });

    await deliver(svc, 'pull_request', {
      action: 'opened',
      pull_request: { merged: false, head: { ref: 'feature/GOV-01-x' } },
    });

    expect(branchRows[0].state).toBe('open');
  });
});

describe('robustesse', () => {
  /**
   * Un événement conservé mais mal appliqué doit quand même répondre 200 :
   * un rejeu serait reconnu comme doublon et n'aurait toujours aucun effet.
   */
  test('un échec d’application ne fait pas échouer la réception', async () => {
    const { svc, rows } = makeService({ repos: [KNOWN_REPO], items: [TICKET] });
    (svc as unknown as { branches: { findOne: () => Promise<never> } }).branches.findOne = async () => {
      throw new Error('base indisponible');
    };

    const out = await deliver(svc, 'create', { ref_type: 'branch', ref: 'feature/GOV-01-x' });

    expect(out.status).toBe('received');
    expect(rows).toHaveLength(1);
  });

  /** Un dépôt hors registre n'a aucun lien à mettre à jour. */
  test('rien n’est appliqué pour un dépôt inconnu', async () => {
    const { svc, branchRows } = makeService({ repos: [], items: [TICKET] });
    await deliver(svc, 'create', { ref_type: 'branch', ref: 'feature/GOV-01-x' });
    expect(branchRows).toHaveLength(0);
  });
});
