import type { TicketPendingReason, TicketStatus } from './ticket.entity';

/**
 * One status-transition point in a ticket's timeline — built from
 * `TicketEvent` rows where `toStatus` is set (`'created'`/`'status_changed'`
 * actions only; `'assigned'`/`'replied'`/`'updated'` carry no status).
 * `pendingReason` mirrors what was actually pending-blocked at that moment
 * (recorded in `TicketEvent.meta` at write time — see `TicketsService.setStatus`),
 * not the ticket's current value, which would be wrong for any pending
 * spell before the most recent one.
 */
export interface TicketStatusPoint {
  toStatus: TicketStatus;
  pendingReason: TicketPendingReason | null;
  createdAt: Date;
}

/**
 * Active (non-paused) milliseconds the SLA clock has run, from the first
 * status point up to `stopAt` (or `now` if the clock hasn't stopped yet —
 * pass `null` for an in-flight response/resolution clock).
 *
 * Only a `pending` segment caused by the client pauses the clock — null
 * (unspecified) behaves as `'client'`, matching how every pending ticket
 * has behaved de facto before `pendingReason` existed. `'vendor'`/`'internal'`
 * pending segments still accrue: the wait is on Nola's side, not the
 * client's, so it isn't credited as paused time.
 *
 * Points at or after `stopAt` contribute nothing — once the clock has
 * stopped (first client reply for response, resolved/closed for
 * resolution), nothing after that instant should count, including a
 * segment that started before `stopAt` but would otherwise run past it.
 */
export function computeActiveMs(
  points: TicketStatusPoint[],
  stopAt: Date | null,
  now: Date,
): number {
  const sorted = [...points].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let elapsedMs = 0;

  for (let i = 0; i < sorted.length; i += 1) {
    const point = sorted[i];
    if (stopAt && point.createdAt.getTime() >= stopAt.getTime()) break;

    const segmentStart = point.createdAt;
    const next = sorted[i + 1];
    const segmentEnd = next ? next.createdAt : (stopAt ?? now);
    const effectiveEnd = stopAt && segmentEnd.getTime() > stopAt.getTime() ? stopAt : segmentEnd;

    const clientPaused =
      point.toStatus === 'pending' && (point.pendingReason === 'client' || point.pendingReason == null);
    if (!clientPaused) {
      elapsedMs += Math.max(0, effectiveEnd.getTime() - segmentStart.getTime());
    }
  }

  return elapsedMs;
}
