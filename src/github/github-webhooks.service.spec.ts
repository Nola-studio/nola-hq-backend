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

function makeService({ repos = [] as any[], duplicate = false } = {}) {
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

  return {
    svc: new GithubWebhooksService(deliveries, repositories, new ConfigService()),
    rows,
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
      { findOne: async () => null, createQueryBuilder: () => ({ where: () => ({ andWhere: () => ({ getOne: async () => null }) }) }) } as any,
      new ConfigService(),
    );
    const raw = body(PUSH);

    await expect(
      svc.receive({ rawBody: raw, signature: sign(raw), deliveryId: 'd1', event: 'push' }),
    ).rejects.toThrow(QueryFailedError);
  });
});
