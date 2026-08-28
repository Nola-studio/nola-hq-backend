import { describe, expect, test, mock } from 'bun:test';
import { NotFoundException } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import type { Ticket } from './ticket.entity';

describe('TicketsService (Brand Scope Filtering)', () => {
  const KHI_LAB_ID = 'bu-khi-lab-uuid-1111';
  const VANTELIS_ID = 'bu-vantelis-uuid-2222';

  const sampleTickets: Ticket[] = [
    {
      id: 1,
      tenant: 'tenant-khi',
      subject: 'Yekoli bug',
      title: 'Yekoli bug',
      body: 'Something broke in Yekoli',
      priority: 'P1',
      status: 'open',
      businessUnitId: KHI_LAB_ID,
      businessUnit: { id: KHI_LAB_ID, code: 'khi-lab', name: 'Khi-Lab' } as any,
      createdAt: new Date(),
    } as Ticket,
    {
      id: 2,
      tenant: 'tenant-vantelis',
      subject: 'Network outage',
      title: 'Network outage',
      body: 'Vantelis managed IT issue',
      priority: 'P2',
      status: 'open',
      businessUnitId: VANTELIS_ID,
      businessUnit: { id: VANTELIS_ID, code: 'vantelis-it', name: 'Vantelis IT' } as any,
      createdAt: new Date(),
    } as Ticket,
  ];

  const businessUnitsMock = {
    resolveAllowedUnits: mock(async (roles: string[] = []) => {
      if (roles.includes('hq:owner')) return [KHI_LAB_ID, VANTELIS_ID];
      if (roles.includes('hq:bu:khi-lab')) return [KHI_LAB_ID];
      if (roles.includes('hq:bu:vantelis-it')) return [VANTELIS_ID];
      return [];
    }),
  } as any;

  function makeService(rows: Ticket[]) {
    const qbMock: any = {
      leftJoinAndSelect: mock(() => qbMock),
      andWhere: mock((clause: string, params: any) => {
        if (params?.allowedUnitIds) {
          qbMock._filtered = rows.filter((r) => params.allowedUnitIds.includes(r.businessUnitId));
        }
        return qbMock;
      }),
      orderBy: mock(() => qbMock),
      getCount: mock(async () => (qbMock._filtered ?? rows).length),
      skip: mock(() => qbMock),
      take: mock(() => qbMock),
      getMany: mock(async () => (qbMock._filtered ?? rows)),
    };

    const repoMock = {
      createQueryBuilder: mock(() => {
        qbMock._filtered = undefined;
        return qbMock;
      }),
      findOne: mock(async ({ where }: any) => {
        const id = where.id;
        const buIn = where.businessUnitId?._value ?? where.businessUnitId;
        return rows.find((r) => r.id === id && (!buIn || buIn.includes(r.businessUnitId))) ?? null;
      }),
      find: mock(async ({ where }: any) => {
        const buIn = where?.businessUnitId?._value ?? where?.businessUnitId;
        if (!buIn) return rows;
        return rows.filter((r) => buIn.includes(r.businessUnitId));
      }),
      save: mock(async (t: any) => t),
    } as any;

    const eventsMock = {
      find: mock(async ({ where }: any) => {
        return [{ id: 'evt-1', ticketId: where.ticketId, action: 'created', createdAt: new Date() }];
      }),
      create: mock((e: any) => e),
      save: mock(async (e: any) => e),
    } as any;
    const teamMembers = [
      { id: 'usr-1', email: 'usr1@nola.dev', notifyEmail: null },
      { id: 'ikamaaurel', email: 'ikamaaurel@gmail.com', notifyEmail: null },
    ];
    const teamMock = {
      findOne: mock(async ({ where }: any) => teamMembers.find((m) => m.id === where.id) ?? null),
    } as any;
    const pushMock = { broadcast: mock(async () => {}), sendTo: mock(async () => {}) } as any;
    const notifyMock = { ticketCreated: mock(() => {}), ticketAssigned: mock(() => {}) } as any;

    return new TicketsService(repoMock, eventsMock, teamMock, pushMock, notifyMock, businessUnitsMock);
  }

  describe('list', () => {
    test('hq:owner sees tickets across all business units', async () => {
      const svc = makeService(sampleTickets);
      const result = await svc.list({}, ['hq:owner']);
      expect(result.total).toBe(2);
      expect(result.items.map((t) => t.id)).toEqual([1, 2]);
    });

    test('hq:viewer with hq:bu:khi-lab sees only khi-lab tickets', async () => {
      const svc = makeService(sampleTickets);
      const result = await svc.list({}, ['hq:viewer', 'hq:bu:khi-lab']);
      expect(result.total).toBe(1);
      expect(result.items[0].id).toBe(1);
      expect(result.items[0].businessUnit.code).toBe('khi-lab');
    });

    test('unscoped non-owner sees zero tickets (fail-closed)', async () => {
      const svc = makeService(sampleTickets);
      const result = await svc.list({}, ['hq:viewer']);
      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
    });
  });

  describe('findOne', () => {
    test('hq:owner can retrieve any ticket', async () => {
      const svc = makeService(sampleTickets);
      const t1 = await svc.findOne(1, ['hq:owner']);
      expect(t1.id).toBe(1);
      const t2 = await svc.findOne(2, ['hq:owner']);
      expect(t2.id).toBe(2);
    });

    test('khi-lab scoped viewer can access ticket 1 but 404s on ticket 2 (vantelis)', async () => {
      const svc = makeService(sampleTickets);
      const t1 = await svc.findOne(1, ['hq:viewer', 'hq:bu:khi-lab']);
      expect(t1.id).toBe(1);

      expect(svc.findOne(2, ['hq:viewer', 'hq:bu:khi-lab'])).rejects.toThrow(NotFoundException);
    });

    test('unscoped non-owner 404s on all tickets', async () => {
      const svc = makeService(sampleTickets);
      expect(svc.findOne(1, ['hq:viewer'])).rejects.toThrow(NotFoundException);
      expect(svc.findOne(2, ['hq:viewer'])).rejects.toThrow(NotFoundException);
    });
  });

  describe('summary', () => {
    test('hq:owner summary counts all tickets', async () => {
      const svc = makeService(sampleTickets);
      const sum = await svc.summary(['hq:owner']);
      expect(sum.total).toBe(2);
      expect(sum.open).toBe(2);
    });

    test('khi-lab viewer summary counts only khi-lab tickets', async () => {
      const svc = makeService(sampleTickets);
      const sum = await svc.summary(['hq:viewer', 'hq:bu:khi-lab']);
      expect(sum.total).toBe(1);
      expect(sum.open).toBe(1);
      expect(sum.p1_open).toBe(1);
    });

    test('unscoped non-owner summary returns all zeroes', async () => {
      const svc = makeService(sampleTickets);
      const sum = await svc.summary(['hq:viewer']);
      expect(sum).toEqual({
        total: 0,
        open: 0,
        pending: 0,
        resolved: 0,
        closed: 0,
        p1_open: 0,
      });
    });
  });

  describe('mutations (operator brand isolation)', () => {
    test('khi-lab operator can reply to ticket 1 but 404s on ticket 2 (vantelis)', async () => {
      const svc = makeService(sampleTickets);
      const res = await svc.addReply(1, { from: 'Alice', text: 'Hello' }, ['hq:operator', 'hq:bu:khi-lab']);
      expect(res.replies?.length).toBe(1);

      expect(
        svc.addReply(2, { from: 'Alice', text: 'Hello' }, ['hq:operator', 'hq:bu:khi-lab']),
      ).rejects.toThrow(NotFoundException);
    });

    test('khi-lab operator can set status on ticket 1 but 404s on ticket 2 (vantelis)', async () => {
      const svc = makeService(sampleTickets);
      const res = await svc.setStatus(1, 'pending', ['hq:operator', 'hq:bu:khi-lab']);
      expect(res.status).toBe('pending');

      expect(
        svc.setStatus(2, 'pending', ['hq:operator', 'hq:bu:khi-lab']),
      ).rejects.toThrow(NotFoundException);
    });

    // `findOne()` hands `setStatus` a spread copy (`toTicketResponse`), so a
    // mutation from one `svc.setStatus()` call never round-trips back into
    // `sampleTickets` for a later call in the same test to observe — the
    // mock's `save` just returns whatever copy it was given. Set the
    // fixture's status directly rather than chaining calls through the
    // service to establish a starting state.
    test('pending defaults pendingReason to null (behaves as client)', async () => {
      const svc = makeService(sampleTickets);
      sampleTickets[0].status = 'open';
      const res = await svc.setStatus(1, 'pending', ['hq:operator', 'hq:bu:khi-lab']);
      expect(res.pendingReason).toBeNull();
    });

    test('pending with an explicit reason stores it', async () => {
      const svc = makeService(sampleTickets);
      sampleTickets[0].status = 'open';
      const res = await svc.setStatus(1, 'pending', ['hq:operator', 'hq:bu:khi-lab'], undefined, 'vendor');
      expect(res.pendingReason).toBe('vendor');
    });

    test('leaving pending clears pendingReason', async () => {
      const svc = makeService(sampleTickets);
      sampleTickets[0].status = 'pending';
      sampleTickets[0].pendingReason = 'vendor';
      const res = await svc.setStatus(1, 'open', ['hq:operator', 'hq:bu:khi-lab']);
      expect(res.pendingReason).toBeNull();
    });

    test('khi-lab operator can assign ticket 1 but 404s on ticket 2 (vantelis)', async () => {
      const svc = makeService(sampleTickets);
      const res = await svc.assign(1, 'usr-1', ['hq:operator', 'hq:bu:khi-lab']);
      expect(res.assignee).toBe('usr-1');

      expect(
        svc.assign(2, 'usr-1', ['hq:operator', 'hq:bu:khi-lab']),
      ).rejects.toThrow(NotFoundException);
    });

    test('assign rejects an assignee id with no matching team member', async () => {
      const svc = makeService(sampleTickets);
      expect(
        svc.assign(1, 'not-a-real-person', ['hq:operator', 'hq:bu:khi-lab']),
      ).rejects.toThrow('not-a-real-person');
    });

    test('assign to a real team member (Aurel) succeeds', async () => {
      const svc = makeService(sampleTickets);
      const res = await svc.assign(1, 'ikamaaurel', ['hq:operator', 'hq:bu:khi-lab']);
      expect(res.assignee).toBe('ikamaaurel');
    });

    test('khi-lab operator can update category and priority on ticket 1', async () => {
      const svc = makeService(sampleTickets);
      const res = await svc.update(1, { priority: 'P2', category: 'billing' }, ['hq:operator', 'hq:bu:khi-lab']);
      expect(res.priority).toBe('P2');
      expect(res.category).toBe('billing');
    });

    test('unscoped operator is denied (404) on all mutations', async () => {
      const svc = makeService(sampleTickets);
      expect(
        svc.addReply(1, { from: 'Alice', text: 'Hello' }, ['hq:operator']),
      ).rejects.toThrow(NotFoundException);
      expect(
        svc.setStatus(1, 'pending', ['hq:operator']),
      ).rejects.toThrow(NotFoundException);
      expect(
        svc.assign(1, 'usr-1', ['hq:operator']),
      ).rejects.toThrow(NotFoundException);
      expect(
        svc.update(1, { priority: 'P2' }, ['hq:operator']),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getEvents (brand isolation)', () => {
    test('khi-lab viewer can read events for ticket 1', async () => {
      const svc = makeService(sampleTickets);
      const events = await svc.getEvents(1, ['hq:viewer', 'hq:bu:khi-lab']);
      expect(events.length).toBe(1);
      expect(events[0].ticketId).toBe(1);
    });

    test('khi-lab viewer cannot read events for ticket 2 (vantelis) -> 404', async () => {
      const svc = makeService(sampleTickets);
      expect(
        svc.getEvents(2, ['hq:viewer', 'hq:bu:khi-lab']),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
