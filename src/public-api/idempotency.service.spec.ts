import { describe, expect, mock, test } from 'bun:test';
import { ConflictException } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';

function makeService() {
  const rows: any[] = [];
  const keys = {
    findOne: mock(async ({ where }: any) =>
      rows.find((r) => r.clientId === where.clientId && r.idempotencyKey === where.idempotencyKey) ?? null,
    ),
    create: mock((r: any) => ({ ...r })),
    save: mock(async (r: any) => {
      rows.push(r);
      return r;
    }),
    delete: mock(async () => ({ affected: rows.length })),
  } as any;
  return { svc: new IdempotencyService(keys), rows };
}

describe('IdempotencyService', () => {
  test('sans clé, la commande s’exécute et rien n’est mémorisé', async () => {
    const { svc, rows } = makeService();
    const run = mock(async () => ({ id: 1 }));
    const { result, replayed } = await svc.run('cli', undefined, 'POST /x', { a: 1 }, run);

    expect(result).toEqual({ id: 1 });
    expect(replayed).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(0);
  });

  test('la même clé rejoue la réponse sans ré-exécuter la commande', async () => {
    const { svc } = makeService();
    const run = mock(async () => ({ id: 1 }));

    const first = await svc.run('cli', 'k1', 'POST /x', { a: 1 }, run);
    const second = await svc.run('cli', 'k1', 'POST /x', { a: 1 }, run);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.result).toEqual({ id: 1 });
    expect(run).toHaveBeenCalledTimes(1);
  });

  /**
   * Rejouer silencieusement l'ancienne réponse masquerait un bug côté
   * appelant. La refuser le lui montre.
   */
  test('la même clé avec un corps différent est refusée', async () => {
    const { svc } = makeService();
    await svc.run('cli', 'k1', 'POST /x', { a: 1 }, async () => ({ id: 1 }));
    await expect(svc.run('cli', 'k1', 'POST /x', { a: 2 }, async () => ({ id: 2 }))).rejects.toThrow(
      ConflictException,
    );
  });

  test('deux clients peuvent employer la même clé sans se croiser', async () => {
    const { svc } = makeService();
    const a = await svc.run('cli-a', 'k1', 'POST /x', { a: 1 }, async () => ({ who: 'a' }));
    const b = await svc.run('cli-b', 'k1', 'POST /x', { a: 2 }, async () => ({ who: 'b' }));

    expect(a.result).toEqual({ who: 'a' });
    expect(b.result).toEqual({ who: 'b' });
    expect(b.replayed).toBe(false);
  });

  /** Une commande qui échoue ne consomme pas la clé : l'appelant peut réessayer. */
  test('un échec ne consomme pas la clé', async () => {
    const { svc, rows } = makeService();
    await expect(
      svc.run('cli', 'k1', 'POST /x', { a: 1 }, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(rows).toHaveLength(0);

    const retry = await svc.run('cli', 'k1', 'POST /x', { a: 1 }, async () => ({ id: 1 }));
    expect(retry.replayed).toBe(false);
    expect(retry.result).toEqual({ id: 1 });
  });
});
