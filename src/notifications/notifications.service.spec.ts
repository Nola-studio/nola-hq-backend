import { describe, expect, test, mock } from 'bun:test';
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

function makeService(initialRows: any[] = []) {
  const rows = [...initialRows];
  let nextId = rows.length + 1;
  const repo = {
    create: mock((data: any) => ({ id: data.id ?? `n-${nextId++}`, ...data })),
    save: mock(async (data: any) => {
      const arr = Array.isArray(data) ? data : [data];
      for (const row of arr) {
        const idx = rows.findIndex((r) => r.id === row.id);
        if (idx >= 0) rows[idx] = row;
        else rows.push(row);
      }
      return data;
    }),
    find: mock(async ({ where }: any) =>
      rows
        .filter((r) => r.recipientId === where.recipientId && r.clearedAt == null)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    ),
    count: mock(
      async ({ where }: any) =>
        rows.filter((r) => r.recipientId === where.recipientId && r.readAt == null && r.clearedAt == null).length,
    ),
    findOne: mock(async ({ where }: any) => rows.find((r) => r.id === where.id && r.recipientId === where.recipientId) ?? null),
    update: mock(async ({ recipientId, readAt, clearedAt }: any, patch: any) => {
      let affected = 0;
      for (const row of rows) {
        if (row.recipientId !== recipientId) continue;
        if (readAt !== undefined && row.readAt != null) continue;
        if (clearedAt !== undefined && row.clearedAt != null) continue;
        Object.assign(row, patch);
        affected += 1;
      }
      return { affected };
    }),
  } as any;

  const nolaClient = { isReady: mock(() => false), getClient: mock(() => ({ publish: mock(async () => {}) })) } as any;
  return { svc: new NotificationsService(repo, nolaClient), rows };
}

describe('NotificationsService', () => {
  test('createForRecipients writes one row per recipient, same content', async () => {
    const { svc, rows } = makeService();
    await svc.createForRecipients(['aurel', 'greg'], { kind: 'ticket_created', title: 'Nouveau ticket P1', ticketId: 5 });
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.recipientId).sort()).toEqual(['aurel', 'greg']);
    expect(rows.every((r) => r.ticketId === 5 && r.kind === 'ticket_created')).toBe(true);
  });

  test('createForRecipients with an empty list writes nothing', async () => {
    const { svc, rows } = makeService();
    const res = await svc.createForRecipients([], { kind: 'ticket_created', title: 'x' });
    expect(res).toEqual([]);
    expect(rows.length).toBe(0);
  });

  test('list excludes cleared notifications, newest first', async () => {
    const now = Date.now();
    const { svc } = makeService([
      { id: 'n-1', recipientId: 'greg', kind: 'ticket_created', title: 'old', readAt: null, clearedAt: null, createdAt: new Date(now - 2000) },
      { id: 'n-2', recipientId: 'greg', kind: 'ticket_created', title: 'new', readAt: null, clearedAt: null, createdAt: new Date(now) },
      { id: 'n-3', recipientId: 'greg', kind: 'ticket_created', title: 'gone', readAt: null, clearedAt: new Date(now), createdAt: new Date(now - 1000) },
    ]);
    const res = await svc.list('greg');
    expect(res.map((r) => r.id)).toEqual(['n-2', 'n-1']);
  });

  test('unreadCount only counts unread, uncleared, for that recipient', async () => {
    const { svc } = makeService([
      { id: 'n-1', recipientId: 'greg', readAt: null, clearedAt: null, createdAt: new Date() },
      { id: 'n-2', recipientId: 'greg', readAt: new Date(), clearedAt: null, createdAt: new Date() },
      { id: 'n-3', recipientId: 'greg', readAt: null, clearedAt: new Date(), createdAt: new Date() },
      { id: 'n-4', recipientId: 'aurel', readAt: null, clearedAt: null, createdAt: new Date() },
    ]);
    expect(await svc.unreadCount('greg')).toBe(1);
  });

  test('markRead sets readAt and is idempotent', async () => {
    const { svc, rows } = makeService([{ id: 'n-1', recipientId: 'greg', readAt: null, clearedAt: null, createdAt: new Date() }]);
    const first = await svc.markRead('n-1', 'greg');
    expect(first.readAt).not.toBeNull();
    const stamp = first.readAt;
    const second = await svc.markRead('n-1', 'greg');
    expect(second.readAt).toEqual(stamp as Date);
    expect(rows.length).toBe(1);
  });

  test('markRead 404s on someone else’s notification — cannot mark another recipient’s row', async () => {
    const { svc } = makeService([{ id: 'n-1', recipientId: 'aurel', readAt: null, clearedAt: null, createdAt: new Date() }]);
    await expect(svc.markRead('n-1', 'greg')).rejects.toThrow(NotFoundException);
  });

  test('markAllRead marks only that recipient’s unread, uncleared rows', async () => {
    const { svc, rows } = makeService([
      { id: 'n-1', recipientId: 'greg', readAt: null, clearedAt: null, createdAt: new Date() },
      { id: 'n-2', recipientId: 'greg', readAt: null, clearedAt: null, createdAt: new Date() },
      { id: 'n-3', recipientId: 'greg', readAt: null, clearedAt: new Date(), createdAt: new Date() },
      { id: 'n-4', recipientId: 'aurel', readAt: null, clearedAt: null, createdAt: new Date() },
    ]);
    const res = await svc.markAllRead('greg');
    expect(res.updated).toBe(2);
    expect(rows.find((r) => r.id === 'n-1').readAt).not.toBeNull();
    expect(rows.find((r) => r.id === 'n-2').readAt).not.toBeNull();
    expect(rows.find((r) => r.id === 'n-4').readAt).toBeNull();
  });

  test('clear sets clearedAt, does not delete the row', async () => {
    const { svc, rows } = makeService([{ id: 'n-1', recipientId: 'greg', readAt: null, clearedAt: null, createdAt: new Date() }]);
    const res = await svc.clear('n-1', 'greg');
    expect(res.clearedAt).not.toBeNull();
    expect(rows.length).toBe(1);
    expect(await svc.list('greg')).toEqual([]);
  });

  test('clear 404s on someone else’s notification', async () => {
    const { svc } = makeService([{ id: 'n-1', recipientId: 'aurel', readAt: null, clearedAt: null, createdAt: new Date() }]);
    await expect(svc.clear('n-1', 'greg')).rejects.toThrow(NotFoundException);
  });
});
