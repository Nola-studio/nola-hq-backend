/**
 * Pure helper for `StudioRecurring` — no Nest/DB deps, unit-tested standalone
 * (same split as `studio.board.ts` / `studio.dashboard-agg.ts`).
 *
 * `annualized` is derived, never stored: a `cycle` of anything containing
 * "Monthly" (including the usage-based variants, e.g. "Monthly
 * (usage-based)") is `amount * 12`; anything containing "Annual" is `amount`
 * as-is. Everything else defaults to monthly — the workbook has no other
 * cycle in practice.
 */
export function annualizedAmount(amount: number, cycle: string): number {
  if (/annual/i.test(cycle)) return amount;
  return amount * 12;
}
