import { describe, expect, test, mock, beforeEach, afterEach, setSystemTime } from 'bun:test';
import { TicketsSlaBreachScheduler } from './tickets-sla-breach.scheduler';

const KHI_LAB_ID = 'bu-khi-lab-id';
const VANTELIS_ID = 'bu-vantelis-id';
const NOW = new Date('2026-08-28T12:30:00.000Z');
const min = (n: number) => new Date(NOW.getTime() - n * 60_000);

// The scheduler calls `new Date()` directly (matching every other
// scheduler in this codebase, e.g. StudioDueSoonScheduler) rather than
// taking an injectable clock — pin the system clock instead of trying to
// inject one, same fix that scheduler's own spec already uses.
beforeEach(() => setSystemTime(NOW));
afterEach(() => setSystemTime());

function makeTicket(overrides: Partial<any> = {}) {
  return {
    id: 1,
    tenant: 'tenant-1',
    subject: 'Serveur down',
    businessUnitId: VANTELIS_ID,
    businessUnit: { code: 'vantelis-it', name: 'Vantelis IT' },
    priority: 'P1',
    status: 'open',
    assignee: 'unassigned',
    ...overrides,
  };
}

function makeScheduler(opts: {
  tickets?: any[];
  policies?: any[];
  events?: any[];
  teamMembers?: any[];
  brandTeam?: any[];
  failCreateActions?: string[];
} = {}) {
  const tickets = opts.tickets ?? [makeTicket()];
  const policies = opts.policies ?? [
    { businessUnitId: VANTELIS_ID, priority: 'P1', responseTargetMinutes: 15, resolutionTargetMinutes: null },
  ];
  const events = opts.events ?? [];
  const teamMembers = opts.teamMembers ?? [];
  const brandTeam = opts.brandTeam ?? [];
  const failCreateActions = new Set(opts.failCreateActions ?? []);
  const savedEvents: any[] = [];
  const createdNotifications: any[] = [];

  const ticketsRepo = { find: mock(async () => tickets) } as any;
  const policiesRepo = { find: mock(async () => policies) } as any;
  const eventsRepo = {
    find: mock(async () => events),
    create: mock((data: any) => data),
    save: mock(async (data: any) => {
      if (failCreateActions.has(data.action)) throw new Error('duplicate key value violates unique constraint');
      savedEvents.push(data);
      return data;
    }),
  } as any;
  const teamRepo = {
    findOne: mock(async ({ where }: any) => teamMembers.find((m) => m.id === where.id) ?? null),
  } as any;
  const pushMock = {
    sendTo: mock(async () => ({ sent: 1 })),
    broadcast: mock(async () => ({ sent: 1 })),
  } as any;
  const teamServiceMock = {
    membersForBusinessUnit: mock(async () => brandTeam),
  } as any;
  const notificationsMock = {
    createForRecipients: mock(async (recipientIds: string[], input: any) => {
      createdNotifications.push({ recipientIds, ...input });
      return [];
    }),
  } as any;

  const scheduler = new TicketsSlaBreachScheduler(
    ticketsRepo,
    eventsRepo,
    policiesRepo,
    teamRepo,
    pushMock,
    teamServiceMock,
    notificationsMock,
  );
  return { scheduler, pushMock, eventsRepo, savedEvents, teamServiceMock, notificationsMock, createdNotifications };
}

describe('TicketsSlaBreachScheduler', () => {
  test('no open tickets — no-op', async () => {
    const { scheduler, eventsRepo } = makeScheduler({ tickets: [] });
    await scheduler.run();
    expect(eventsRepo.find).not.toHaveBeenCalled();
  });

  test('no policy row for the ticket’s (brand, priority) — skipped, nothing recorded', async () => {
    const { scheduler, savedEvents } = makeScheduler({ policies: [] });
    await scheduler.run();
    expect(savedEvents).toEqual([]);
  });

  test('policy row exists but target is null — skipped for that clock', async () => {
    const { scheduler, savedEvents } = makeScheduler({
      policies: [{ businessUnitId: VANTELIS_ID, priority: 'P1', responseTargetMinutes: null, resolutionTargetMinutes: null }],
      events: [{ ticketId: 1, action: 'created', toStatus: 'open', meta: {}, createdAt: min(60) }],
    });
    await scheduler.run();
    expect(savedEvents).toEqual([]);
  });

  test('under 80% of target — no alert, nothing recorded', async () => {
    const { scheduler, pushMock, savedEvents } = makeScheduler({
      events: [{ ticketId: 1, action: 'created', toStatus: 'open', meta: {}, createdAt: min(5) }], // 5 of 15 min
    });
    await scheduler.run();
    expect(savedEvents).toEqual([]);
    expect(pushMock.sendTo).not.toHaveBeenCalled();
  });

  test('at/above 80% of target, unassigned — resolves the brand team and notifies each, no unscoped broadcast', async () => {
    const { scheduler, pushMock, savedEvents, teamServiceMock, createdNotifications } = makeScheduler({
      brandTeam: [
        { id: 'aurel', email: 'aurel@nola.dev', notifyEmail: null },
        { id: 'greg', email: 'greg@nola.dev', notifyEmail: null },
      ],
      events: [{ ticketId: 1, action: 'created', toStatus: 'open', meta: {}, createdAt: min(13) }], // 13 of 15 min = ~87%
    });
    await scheduler.run();
    expect(savedEvents.map((e) => e.action)).toEqual(['sla_response_approaching']);
    expect(teamServiceMock.membersForBusinessUnit).toHaveBeenCalledWith('vantelis-it');
    expect(pushMock.sendTo).toHaveBeenCalledTimes(2);
    expect(pushMock.broadcast).not.toHaveBeenCalled();
    expect(createdNotifications[0].recipientIds.sort()).toEqual(['aurel', 'greg']);
    expect(createdNotifications[0].kind).toBe('sla_response_approaching');
  });

  test('unassigned with no resolvable brand team — no alert, no notification, no error', async () => {
    const { scheduler, pushMock, createdNotifications } = makeScheduler({
      brandTeam: [],
      events: [{ ticketId: 1, action: 'created', toStatus: 'open', meta: {}, createdAt: min(13) }],
    });
    await scheduler.run();
    expect(pushMock.sendTo).not.toHaveBeenCalled();
    expect(createdNotifications).toEqual([]);
  });

  test('approaching, assigned to a real team member — sendTo them only, notification recipient matches', async () => {
    const { scheduler, pushMock, teamServiceMock, createdNotifications } = makeScheduler({
      tickets: [makeTicket({ assignee: 'ikamaaurel' })],
      teamMembers: [{ id: 'ikamaaurel', email: 'ikamaaurel@gmail.com', notifyEmail: null }],
      events: [{ ticketId: 1, action: 'created', toStatus: 'open', meta: {}, createdAt: min(13) }],
    });
    await scheduler.run();
    expect(pushMock.sendTo).toHaveBeenCalledTimes(1);
    expect(pushMock.sendTo.mock.calls[0][0]).toBe('ikamaaurel@gmail.com');
    expect(pushMock.broadcast).not.toHaveBeenCalled();
    // Assigned case never needs the brand-team (Keycloak) lookup at all.
    expect(teamServiceMock.membersForBusinessUnit).not.toHaveBeenCalled();
    expect(createdNotifications[0].recipientIds).toEqual(['ikamaaurel']);
  });

  test('already recorded (unique violation) — does not re-alert', async () => {
    const { scheduler, pushMock, createdNotifications } = makeScheduler({
      failCreateActions: ['sla_response_approaching'],
      brandTeam: [{ id: 'aurel', email: 'aurel@nola.dev', notifyEmail: null }],
      events: [{ ticketId: 1, action: 'created', toStatus: 'open', meta: {}, createdAt: min(13) }],
    });
    await scheduler.run();
    expect(pushMock.broadcast).not.toHaveBeenCalled();
    expect(pushMock.sendTo).not.toHaveBeenCalled();
    expect(createdNotifications).toEqual([]);
  });

  test('at/above 100% of target — records breached, does NOT alert (approaching is the alert, breached is data-only)', async () => {
    const { scheduler, pushMock, savedEvents, createdNotifications } = makeScheduler({
      brandTeam: [{ id: 'aurel', email: 'aurel@nola.dev', notifyEmail: null }],
      events: [{ ticketId: 1, action: 'created', toStatus: 'open', meta: {}, createdAt: min(20) }], // 20 of 15 min
    });
    await scheduler.run();
    expect(savedEvents.map((e) => e.action)).toEqual(['sla_response_breached']);
    expect(pushMock.broadcast).not.toHaveBeenCalled();
    expect(pushMock.sendTo).not.toHaveBeenCalled();
    expect(createdNotifications).toEqual([]);
  });

  test('already responded (client-visible reply exists) — response clock skipped entirely', async () => {
    const { scheduler, savedEvents } = makeScheduler({
      events: [
        { ticketId: 1, action: 'created', toStatus: 'open', meta: {}, createdAt: min(20) },
        { ticketId: 1, action: 'replied', toStatus: null, meta: { visibility: 'client' }, createdAt: min(18) },
      ],
    });
    await scheduler.run();
    expect(savedEvents).toEqual([]);
  });

  test('an internal-only reply does not stop the response clock', async () => {
    const { scheduler, savedEvents } = makeScheduler({
      events: [
        { ticketId: 1, action: 'created', toStatus: 'open', meta: {}, createdAt: min(20) },
        { ticketId: 1, action: 'replied', toStatus: null, meta: { visibility: 'internal' }, createdAt: min(18) },
      ],
    });
    await scheduler.run();
    // Still 20 min elapsed against a 15 min target — breached, since an
    // internal note never stopped the clock.
    expect(savedEvents.map((e) => e.action)).toEqual(['sla_response_breached']);
  });

  test('client pending pauses the clock — stays under threshold', async () => {
    const { scheduler, savedEvents } = makeScheduler({
      events: [
        { ticketId: 1, action: 'created', toStatus: 'open', meta: {}, createdAt: min(20) },
        { ticketId: 1, action: 'status_changed', toStatus: 'pending', meta: { pendingReason: 'client' }, createdAt: min(15) },
      ],
      // status is still 'open' in the fixture ticket for this to be in the sweep — real
      // tickets would show 'pending' here; the sweep filters on status !== resolved/closed
      // regardless, so this exercises the pause math against a ticket that's mid-pending.
    });
    await scheduler.run();
    // Elapsed active = 20-15 = 5 min (0-15 open, wait no: created at min(20), pending at
    // min(15) — active from min(20) to min(15) = 5 min, then paused from min(15) to now.
    expect(savedEvents).toEqual([]);
  });

  test('responded late but under 100% (80-99% band) — no moot approaching alert fires post-response', async () => {
    const { scheduler, pushMock, savedEvents } = makeScheduler({
      events: [
        { ticketId: 1, action: 'created', toStatus: 'open', meta: {}, createdAt: min(20) },
        { ticketId: 1, action: 'replied', toStatus: null, meta: { visibility: 'client' }, createdAt: min(6) },
      ],
    });
    await scheduler.run();
    // 20-6 = 14 min active before stop, >= 80% of 15 min (12 min) but < 15 min
    // -> would be "approaching" for a still-running clock, but this one has
    // already stopped, so nothing should fire — not even a retroactive
    // approaching alert, since there's nothing left to warn about.
    expect(savedEvents).toEqual([]);
    expect(pushMock.broadcast).not.toHaveBeenCalled();
    expect(pushMock.sendTo).not.toHaveBeenCalled();
  });

  test('resolution clock is checked even while response has already stopped', async () => {
    const { scheduler, savedEvents } = makeScheduler({
      policies: [
        { businessUnitId: VANTELIS_ID, priority: 'P1', responseTargetMinutes: 15, resolutionTargetMinutes: 15 },
      ],
      events: [
        { ticketId: 1, action: 'created', toStatus: 'open', meta: {}, createdAt: min(20) },
        { ticketId: 1, action: 'replied', toStatus: null, meta: { visibility: 'client' }, createdAt: min(1) },
      ],
    });
    await scheduler.run();
    // Response stopped at min(1) (19 min active before stop -> already breached,
    // recorded once) — resolution clock is independent and still running to now
    // (20 min elapsed, unstopped) -> also breached.
    expect(savedEvents.map((e) => e.action).sort()).toEqual(['sla_resolution_breached', 'sla_response_breached']);
  });

  test('brand team is resolved once per sweep, not once per ticket', async () => {
    const ticketA = makeTicket({ id: 1 });
    const ticketB = makeTicket({ id: 2 });
    const { scheduler, teamServiceMock } = makeScheduler({
      tickets: [ticketA, ticketB],
      brandTeam: [{ id: 'aurel', email: 'aurel@nola.dev', notifyEmail: null }],
      events: [
        { ticketId: 1, action: 'created', toStatus: 'open', meta: {}, createdAt: min(13) },
        { ticketId: 2, action: 'created', toStatus: 'open', meta: {}, createdAt: min(13) },
      ],
    });
    await scheduler.run();
    expect(teamServiceMock.membersForBusinessUnit).toHaveBeenCalledTimes(1);
  });
});
