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
    resolve: mock(async (code: string) => {
      if (code === 'khi-lab') return KHI_LAB_ID;
      if (code === 'vantelis-it') return VANTELIS_ID;
      throw new Error(`Unknown business unit code '${code}'`);
    }),
  } as any;

  function makeService(rows: Ticket[], slaPolicyRows: any[] = []) {
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
      create: mock((t: any) => t),
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
    const slaPoliciesMock = {
      findOne: mock(async ({ where }: any) =>
        slaPolicyRows.find((p) => p.businessUnitId === where.businessUnitId && p.priority === where.priority) ??
        null,
      ),
    } as any;
    const pushMock = { broadcast: mock(async () => {}), sendTo: mock(async () => {}) } as any;
    const notifyMock = { ticketCreated: mock(() => {}), ticketAssigned: mock(() => {}) } as any;
    const brandTeams: Record<string, typeof teamMembers> = {
      'khi-lab': [teamMembers[0]],
      'vantelis-it': [teamMembers[1]],
    };
    const teamServiceMock = {
      membersForBusinessUnit: mock(async (code: string) => brandTeams[code] ?? []),
      findByEmail: mock(async (email: string) => teamMembers.find((m) => m.email === email) ?? null),
    } as any;
    const productsList: any[] = [
      {
        id: 'prod-yekoli-uuid',
        code: 'yekoli',
        name: 'Yekoli',
        businessUnitId: KHI_LAB_ID,
        sourceAliases: ['kelasi-owner-app', 'kelasi-web'],
      },
      {
        id: 'prod-butterfly-uuid',
        code: 'butterfly',
        name: 'Butterfly',
        businessUnitId: KHI_LAB_ID,
        sourceAliases: [],
      },
    ];
    const productsMock = {
      findOne: mock(async ({ where }: any) => {
        if (where.id) return productsList.find((p) => p.id === where.id) ?? null;
        if (where.code) return productsList.find((p) => p.code === where.code) ?? null;
        return null;
      }),
      find: mock(async () => productsList),
    } as any;

    const notificationsMock = {
      createForRecipients: mock(async () => []),
    } as any;

    lastEventsMock = eventsMock;
    lastNotificationsMock = notificationsMock;
    lastTeamServiceMock = teamServiceMock;
    return new TicketsService(
      repoMock,
      eventsMock,
      teamMock,
      slaPoliciesMock,
      productsMock,
      pushMock,
      notifyMock,
      businessUnitsMock,
      teamServiceMock,
      notificationsMock,
    );
  }

  /** Set by `makeService()` on each call — lets a test inspect what got
   * written to `ticket_events` without changing `makeService`'s return shape. */
  let lastEventsMock: any;
  let lastNotificationsMock: any;
  let lastTeamServiceMock: any;

  function makeServiceWithEventsRepo(rows: Ticket[], slaPolicyRows: any[] = []) {
    const svc = makeService(rows, slaPolicyRows);
    return { svc, eventsRepo: lastEventsMock };
  }

  function makeServiceWithMocks(rows: Ticket[], slaPolicyRows: any[] = []) {
    const svc = makeService(rows, slaPolicyRows);
    return { svc, notifications: lastNotificationsMock, teamService: lastTeamServiceMock };
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

    test('status_changed event records pendingReason in meta, not just the ticket row', async () => {
      // The elapsed-time walk (sla-elapsed.ts) needs the reason attached to
      // each historical pending spell, not just the ticket's current value —
      // that's why this lives in the event's own meta.
      const { svc, eventsRepo } = makeServiceWithEventsRepo(sampleTickets);
      sampleTickets[0].status = 'open';
      await svc.setStatus(1, 'pending', ['hq:operator', 'hq:bu:khi-lab'], undefined, 'vendor');
      const created = eventsRepo.create.mock.calls.at(-1)?.[0] as any;
      expect(created.action).toBe('status_changed');
      expect(created.meta).toEqual({ pendingReason: 'vendor' });
    });

    test('leaving pending clears pendingReason', async () => {
      const svc = makeService(sampleTickets);
      sampleTickets[0].status = 'pending';
      sampleTickets[0].pendingReason = 'vendor';
      const res = await svc.setStatus(1, 'open', ['hq:operator', 'hq:bu:khi-lab']);
      expect(res.pendingReason).toBeNull();
    });

    test('updating pendingReason on already-pending ticket updates the reason and emits event', async () => {
      const { svc, eventsRepo } = makeServiceWithEventsRepo(sampleTickets);
      sampleTickets[0].status = 'pending';
      sampleTickets[0].pendingReason = 'client';
      const res = await svc.setStatus(1, 'pending', ['hq:operator', 'hq:bu:khi-lab'], 'Alice', 'vendor');
      expect(res.pendingReason).toBe('vendor');
      const created = eventsRepo.create.mock.calls.at(-1)?.[0] as any;
      expect(created.action).toBe('status_changed');
      expect(created.meta).toEqual({ pendingReason: 'vendor' });
    });

    test('resolving a ticket requires a valid resolutionCode', async () => {
      const svc = makeService(sampleTickets);
      sampleTickets[0].status = 'open';
      expect(svc.setStatus(1, 'resolved', ['hq:operator', 'hq:bu:khi-lab'])).rejects.toThrow(
        /code de résolution/,
      );
      expect(
        svc.setStatus(1, 'resolved', ['hq:operator', 'hq:bu:khi-lab'], 'Alice', undefined, 'invalid_code' as any),
      ).rejects.toThrow(/invalide/);
    });

    test('resolving with doublon or transfere requires non-empty resolutionNotes', async () => {
      const svc = makeService(sampleTickets);
      sampleTickets[0].status = 'open';
      expect(
        svc.setStatus(1, 'resolved', ['hq:operator', 'hq:bu:khi-lab'], 'Alice', undefined, 'doublon', ''),
      ).rejects.toThrow(/note explicative/);
      expect(
        svc.setStatus(1, 'resolved', ['hq:operator', 'hq:bu:khi-lab'], 'Alice', undefined, 'transfere', '   '),
      ).rejects.toThrow(/note explicative/);

      const res = await svc.setStatus(
        1,
        'resolved',
        ['hq:operator', 'hq:bu:khi-lab'],
        'Alice',
        undefined,
        'doublon',
        'Doublon de #42',
      );
      expect(res.status).toBe('resolved');
      expect(res.resolutionCode).toBe('doublon');
      expect(res.resolutionNotes).toBe('Doublon de #42');
    });

    test('resolving with corrige records resolutionCode and notes in event', async () => {
      const { svc, eventsRepo } = makeServiceWithEventsRepo(sampleTickets);
      sampleTickets[0].status = 'open';
      sampleTickets[0].resolutionCode = null;
      sampleTickets[0].resolutionNotes = null;
      const res = await svc.setStatus(
        1,
        'resolved',
        ['hq:operator', 'hq:bu:khi-lab'],
        'Alice',
        undefined,
        'corrige',
        'Bug corrigé en prod',
      );
      expect(res.resolutionCode).toBe('corrige');
      expect(res.resolutionNotes).toBe('Bug corrigé en prod');
      const created = eventsRepo.create.mock.calls.at(-1)?.[0] as any;
      expect(created.action).toBe('status_changed');
      expect(created.reason).toBe('Bug corrigé en prod');
      expect(created.meta).toEqual({
        resolutionCode: 'corrige',
        resolutionNotes: 'Bug corrigé en prod',
      });
    });

    test('reopening a resolved ticket clears resolutionCode and resolutionNotes', async () => {
      const svc = makeService(sampleTickets);
      sampleTickets[0].status = 'resolved';
      sampleTickets[0].resolutionCode = 'corrige';
      sampleTickets[0].resolutionNotes = 'Fixed';
      const res = await svc.setStatus(1, 'open', ['hq:operator', 'hq:bu:khi-lab']);
      expect(res.status).toBe('open');
      expect(res.resolutionCode).toBeNull();
      expect(res.resolutionNotes).toBeNull();
      sampleTickets[0].resolutionCode = null;
      sampleTickets[0].resolutionNotes = null;
    });

    test('re-submitting unchanged pending status and reason is an idempotent no-op', async () => {
      const { svc, eventsRepo } = makeServiceWithEventsRepo(sampleTickets);
      sampleTickets[0].status = 'pending';
      sampleTickets[0].pendingReason = 'vendor';
      sampleTickets[0].resolutionCode = null;
      sampleTickets[0].resolutionNotes = null;
      const prevCalls = eventsRepo.save.mock.calls.length;
      const res = await svc.setStatus(1, 'pending', ['hq:operator', 'hq:bu:khi-lab'], 'Alice', 'vendor');
      expect(res.pendingReason).toBe('vendor');
      expect(eventsRepo.save.mock.calls.length).toBe(prevCalls);
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

  describe('create (sla derivation)', () => {
    const baseDto = {
      tenant: 'tenant-1',
      subject: 'Aide',
      body: 'Bonjour',
      contact: 'owner@example.com',
      priority: 'P1' as const,
      assignee: 'unassigned',
      businessUnitCode: 'vantelis-it',
    };

    test('no sla_policies row -> blank sla, not a default', async () => {
      const svc = makeService([], []);
      const t = await svc.create(baseDto);
      expect(t.sla).toBe('');
    });

    test('row exists but target unconfigured (null) -> blank sla', async () => {
      const svc = makeService([], [
        { businessUnitId: VANTELIS_ID, priority: 'P1', resolutionTargetMinutes: null },
      ]);
      const t = await svc.create(baseDto);
      expect(t.sla).toBe('');
    });

    test('configured target under an hour -> "N min"', async () => {
      const svc = makeService([], [
        { businessUnitId: VANTELIS_ID, priority: 'P1', resolutionTargetMinutes: 15 },
      ]);
      const t = await svc.create(baseDto);
      expect(t.sla).toBe('15 min');
    });

    test('configured target on the hour -> "Nh"', async () => {
      const svc = makeService([], [
        { businessUnitId: VANTELIS_ID, priority: 'P1', resolutionTargetMinutes: 240 },
      ]);
      const t = await svc.create(baseDto);
      expect(t.sla).toBe('4h');
    });

    test('configured target with a remainder -> "NhMM"', async () => {
      const svc = makeService([], [
        { businessUnitId: VANTELIS_ID, priority: 'P1', resolutionTargetMinutes: 90 },
      ]);
      const t = await svc.create(baseDto);
      expect(t.sla).toBe('1h30');
    });

    test('policy is looked up by priority too, not just brand', async () => {
      const svc = makeService([], [
        { businessUnitId: VANTELIS_ID, priority: 'P1', resolutionTargetMinutes: 15 },
        { businessUnitId: VANTELIS_ID, priority: 'P3', resolutionTargetMinutes: 1440 },
      ]);
      const t = await svc.create({ ...baseDto, priority: 'P3' });
      expect(t.sla).toBe('24h');
    });
  });

  describe('notification wiring (recipient resolution shared with push)', () => {
    const baseDto = {
      tenant: 'tenant-1',
      subject: 'Aide',
      body: 'Bonjour',
      contact: 'owner@example.com',
      priority: 'P1' as const,
      assignee: 'unassigned',
      businessUnitCode: 'vantelis-it',
    };

    test('create() resolves the brand team, not everyone — no more unscoped broadcast', async () => {
      const { svc, notifications, teamService } = makeServiceWithMocks([]);
      await svc.create(baseDto);
      expect(teamService.membersForBusinessUnit).toHaveBeenCalledWith('vantelis-it');
      const call = notifications.createForRecipients.mock.calls[0];
      expect(call[0]).toEqual(['ikamaaurel']);
      expect(call[1].kind).toBe('ticket_created');
    });

    test('create() for a brand with no resolvable team writes no notifications (null-tolerant, not an error)', async () => {
      const { svc, notifications } = makeServiceWithMocks([]);
      // businessUnitsMock.resolve only knows khi-lab/vantelis-it, so route
      // through one of those but with a brand-team fixture that resolves
      // to nobody — the fixture's `brandTeams` map has no entry beyond
      // khi-lab/vantelis-it, so exercise that directly by clearing it.
      lastTeamServiceMock.membersForBusinessUnit = mock(async () => []);
      await svc.create(baseDto);
      expect(notifications.createForRecipients).not.toHaveBeenCalled();
    });

    test('assign() notifies only the new assignee, sharing the same resolved member with push', async () => {
      const { svc, notifications } = makeServiceWithMocks(sampleTickets);
      sampleTickets[0].status = 'open';
      await svc.assign(1, 'ikamaaurel', ['hq:operator', 'hq:bu:khi-lab']);
      const call = notifications.createForRecipients.mock.calls.at(-1);
      expect(call?.[0]).toEqual(['ikamaaurel']);
      expect(call?.[1].kind).toBe('ticket_assigned');
    });

    test('assign() to the unassigned sentinel writes no notification', async () => {
      const { svc, notifications } = makeServiceWithMocks(sampleTickets);
      sampleTickets[0].status = 'open';
      sampleTickets[0].assignee = 'ikamaaurel';
      await svc.assign(1, 'unassigned', ['hq:operator', 'hq:bu:khi-lab']);
      expect(notifications.createForRecipients).not.toHaveBeenCalled();
    });

    test('setStatus() notifies the assignee, not the brand team', async () => {
      const { svc, notifications } = makeServiceWithMocks(sampleTickets);
      sampleTickets[0].status = 'open';
      sampleTickets[0].assignee = 'ikamaaurel';
      await svc.setStatus(1, 'pending', ['hq:operator', 'hq:bu:khi-lab']);
      const call = notifications.createForRecipients.mock.calls.at(-1);
      expect(call?.[0]).toEqual(['ikamaaurel']);
      expect(call?.[1].kind).toBe('ticket_status_changed');
    });

    test('setStatus() on an unassigned ticket writes no notification', async () => {
      const { svc, notifications } = makeServiceWithMocks(sampleTickets);
      sampleTickets[0].status = 'open';
      sampleTickets[0].assignee = 'unassigned';
      await svc.setStatus(1, 'pending', ['hq:operator', 'hq:bu:khi-lab']);
      expect(notifications.createForRecipients).not.toHaveBeenCalled();
    });
  });

  describe('productId resolution and business unit constraint', () => {
    test('create() resolves product from sourceAliases (kelasi-owner-app -> yekoli)', async () => {
      const svc = makeService([]);
      const ticket = await svc.create({
        tenant: 'tenant-1',
        subject: 'Yekoli bug',
        body: 'Issue in app',
        contact: 'dev@nola.dev',
        priority: 'P2',
        assignee: 'unassigned',
        source: 'kelasi-owner-app',
        businessUnitCode: 'khi-lab',
      });
      expect(ticket.productId).toBe('prod-yekoli-uuid');
    });

    test('create() resolves product from source (butterfly)', async () => {
      const svc = makeService([]);
      const ticket = await svc.create({
        tenant: 'tenant-1',
        subject: 'Butterfly bug',
        body: 'Issue in app',
        contact: 'dev@nola.dev',
        priority: 'P2',
        assignee: 'unassigned',
        source: 'butterfly',
        businessUnitCode: 'khi-lab',
      });
      expect(ticket.productId).toBe('prod-butterfly-uuid');
    });

    test('create() with explicit valid productId succeeds', async () => {
      const svc = makeService([]);
      const ticket = await svc.create({
        tenant: 'tenant-1',
        subject: 'Explicit product',
        body: 'Issue in app',
        contact: 'dev@nola.dev',
        priority: 'P2',
        assignee: 'unassigned',
        businessUnitCode: 'khi-lab',
        productId: 'prod-yekoli-uuid',
      });
      expect(ticket.productId).toBe('prod-yekoli-uuid');
    });

    test('create() with productId belonging to another BU throws BadRequestException', async () => {
      const svc = makeService([]);
      expect(
        svc.create({
          tenant: 'tenant-1',
          subject: 'Mismatched product',
          body: 'Issue',
          contact: 'dev@nola.dev',
          priority: 'P2',
          assignee: 'unassigned',
          businessUnitCode: 'vantelis-it',
          productId: 'prod-yekoli-uuid', // belongs to khi-lab
        }),
      ).rejects.toThrow(/n'appartient pas/);
    });

    test('create() with unknown productId throws BadRequestException', async () => {
      const svc = makeService([]);
      expect(
        svc.create({
          tenant: 'tenant-1',
          subject: 'Unknown product',
          body: 'Issue',
          contact: 'dev@nola.dev',
          priority: 'P2',
          assignee: 'unassigned',
          businessUnitCode: 'khi-lab',
          productId: 'non-existent-uuid',
        }),
      ).rejects.toThrow(/introuvable/);
    });

    test('update() validates BU constraint and records productId changes in event', async () => {
      const { svc, eventsRepo } = makeServiceWithEventsRepo(sampleTickets);
      sampleTickets[0].productId = null;
      const updated = await svc.update(
        1,
        { productId: 'prod-butterfly-uuid' },
        ['hq:operator', 'hq:bu:khi-lab'],
        'Alice',
      );
      expect(updated.productId).toBe('prod-butterfly-uuid');
      const created = eventsRepo.create.mock.calls.at(-1)?.[0] as any;
      expect(created.action).toBe('updated');
      expect(created.meta).toEqual({
        fromProductId: null,
        toProductId: 'prod-butterfly-uuid',
      });
    });
  });
});
