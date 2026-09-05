import { describe, expect, test } from 'bun:test';
import { computeActiveMs, type TicketStatusPoint } from './sla-elapsed';

const T0 = new Date('2026-08-28T12:00:00.000Z');
const min = (n: number) => new Date(T0.getTime() + n * 60_000);

describe('computeActiveMs', () => {
  test('no pending: elapsed equals wall-clock time to now', () => {
    const points: TicketStatusPoint[] = [{ toStatus: 'open', pendingReason: null, createdAt: T0 }];
    expect(computeActiveMs(points, null, min(10))).toBe(10 * 60_000);
  });

  test('client pending pauses the clock', () => {
    const points: TicketStatusPoint[] = [
      { toStatus: 'open', pendingReason: null, createdAt: T0 },
      { toStatus: 'pending', pendingReason: 'client', createdAt: min(5) },
      { toStatus: 'open', pendingReason: null, createdAt: min(8) },
    ];
    // 5 min open, 3 min paused (excluded), 2 more min open = 7 active
    expect(computeActiveMs(points, null, min(10))).toBe(7 * 60_000);
  });

  test('null pendingReason on a pending segment behaves as client (paused)', () => {
    const points: TicketStatusPoint[] = [
      { toStatus: 'open', pendingReason: null, createdAt: T0 },
      { toStatus: 'pending', pendingReason: null, createdAt: min(5) },
    ];
    expect(computeActiveMs(points, null, min(10))).toBe(5 * 60_000);
  });

  test('vendor pending does NOT pause — still credited against the clock', () => {
    const points: TicketStatusPoint[] = [
      { toStatus: 'open', pendingReason: null, createdAt: T0 },
      { toStatus: 'pending', pendingReason: 'vendor', createdAt: min(5) },
      { toStatus: 'open', pendingReason: null, createdAt: min(8) },
    ];
    expect(computeActiveMs(points, null, min(10))).toBe(10 * 60_000);
  });

  test('internal pending does NOT pause either', () => {
    const points: TicketStatusPoint[] = [
      { toStatus: 'pending', pendingReason: 'internal', createdAt: T0 },
    ];
    expect(computeActiveMs(points, null, min(4))).toBe(4 * 60_000);
  });

  test('multiple pending cycles each honor their own recorded reason, not just the latest', () => {
    const points: TicketStatusPoint[] = [
      { toStatus: 'open', pendingReason: null, createdAt: T0 },
      { toStatus: 'pending', pendingReason: 'vendor', createdAt: min(2) }, // 0-2 min accrues (open)
      { toStatus: 'open', pendingReason: null, createdAt: min(4) }, // 2-4 min accrues (vendor, not paused)
      { toStatus: 'pending', pendingReason: 'client', createdAt: min(6) }, // 4-6 min accrues (open)
      { toStatus: 'open', pendingReason: null, createdAt: min(9) }, // 6-9 excluded (client)
    ]; // 9-10 accrues (open)
    // active = (2-0) + (4-2) + (6-4) + (10-9) = 2+2+2+1 = 7 min; 6-9 (3 min) excluded
    expect(computeActiveMs(points, null, min(10))).toBe(7 * 60_000);
  });

  test('stopAt caps elapsed regardless of how much later "now" is', () => {
    const points: TicketStatusPoint[] = [{ toStatus: 'open', pendingReason: null, createdAt: T0 }];
    expect(computeActiveMs(points, min(6), min(200))).toBe(6 * 60_000);
  });

  test('stopAt truncates a segment that would otherwise run past it', () => {
    const points: TicketStatusPoint[] = [
      { toStatus: 'open', pendingReason: null, createdAt: T0 },
      { toStatus: 'pending', pendingReason: 'client', createdAt: min(20) },
    ];
    // stopAt lands inside the first (open) segment, well before the pending point
    expect(computeActiveMs(points, min(5), min(100))).toBe(5 * 60_000);
  });

  test('points at or after stopAt contribute nothing', () => {
    const points: TicketStatusPoint[] = [
      { toStatus: 'open', pendingReason: null, createdAt: T0 },
      { toStatus: 'pending', pendingReason: 'client', createdAt: min(3) },
      { toStatus: 'open', pendingReason: null, createdAt: min(5) },
    ];
    // stopAt exactly on the second 'open' point: only count up through the pending exclusion at min(3)
    expect(computeActiveMs(points, min(5), min(100))).toBe(3 * 60_000);
  });

  test('empty points -> zero', () => {
    expect(computeActiveMs([], null, min(10))).toBe(0);
  });

  test('unsorted input is sorted before walking', () => {
    const points: TicketStatusPoint[] = [
      { toStatus: 'open', pendingReason: null, createdAt: min(5) },
      { toStatus: 'open', pendingReason: null, createdAt: T0 },
    ];
    expect(computeActiveMs(points, null, min(10))).toBe(10 * 60_000);
  });
});
