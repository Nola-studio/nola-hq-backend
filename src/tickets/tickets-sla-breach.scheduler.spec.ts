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
  failCreateActions?: string[];
} = {}) {
  const tickets = opts.tickets ?? [makeTicket()];
  const policies = opts.policies ?? [
    { businessUnitId: VANTELIS_ID, priority: 'P1', responseTargetMinutes: 15, resolutionTargetMinutes: null },
  ];
  const events = opts.events ?? [];
  const teamMembers = opts.teamMembers ?? [];
  const failCreateActions = new Set(opts.failCreateActions ?? []);
  const savedEvents: any[] = [];

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

  const scheduler = new TicketsSlaBreachScheduler(ticketsRepo, eventsRepo, policiesRepo, teamRepo, pushMock);
  return { scheduler, pushMock, eventsRepo, savedEvents };
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
    expect(pushMock.broadcast).not.toHaveBeenCalled();
  });

  test('at/above 80% of target, unassigned — records approaching and broadcasts', async () => {
    const { scheduler, pushMock, savedEvents } = makeScheduler({
      events: [{ ticketId: 1, action: 'created', toStatus: 'open', meta: {}, createdAt: min(13) }], // 13 of 15 min = ~87%
    });
    await scheduler.run();
    expect(savedEvents.map((e) => e.action)).toEqual(['sla_response_approaching']);
    expect(pushMock.broadcast).toHaveBeenCalledTimes(1);
    expect(pushMock.sendTo).not.toHaveBeenCalled();
  });

  test('approaching, assigned to a real team member — sendTo them, not broadcast', async () => {
    const { scheduler, pushMock } = makeScheduler({
      tickets: [makeTicket({ assignee: 'ikamaaurel' })],
      teamMembers: [{ id: 'ikamaaurel', email: 'ikamaaurel@gmail.com', notifyEmail: null }],
      events: [{ ticketId: 1, action: 'created', toStatus: 'open', meta: {}, createdAt: min(13) }],
    });
    await scheduler.run();
    expect(pushMock.sendTo).toHaveBeenCalledTimes(1);
    expect(pushMock.sendTo.mock.calls[0][0]).toBe('ikamaaurel@gmail.com');
    expect(pushMock.broadcast).not.toHaveBeenCalled();
  });

  test('already recorded (unique violation) — does not re-alert', async () => {
    const { scheduler, pushMock } = makeScheduler({
      failCreateActions: ['sla_response_approaching'],
      events: [{ ticketId: 1, action: 'created', toStatus: 'open', meta: {}, createdAt: min(13) }],
    });
    await scheduler.run();
    expect(pushMock.broadcast).not.toHaveBeenCalled();
    expect(pushMock.sendTo).not.toHaveBeenCalled();
  });

  test('at/above 100% of target — records breached, does NOT alert (approaching is the alert, breached is data-only)', async () => {
    const { scheduler, pushMock, savedEvents } = makeScheduler({
      events: [{ ticketId: 1, action: 'created', toStatus: 'open', meta: {}, createdAt: min(20) }], // 20 of 15 min
    });
    await scheduler.run();
    expect(savedEvents.map((e) => e.action)).toEqual(['sla_response_breached']);
    expect(pushMock.broadcast).not.toHaveBeenCalled();
    expect(pushMock.sendTo).not.toHaveBeenCalled();
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
});
