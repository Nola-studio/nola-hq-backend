/**
 * A per-currency breakdown, e.g. `{ CDF: 2_400_000, USD: 800 }` — the shape
 * every cross-entity money total in this module returns now that currency
 * is chosen per-record. Never collapse this into a single number: that
 * would mean silently converting or dropping a currency, both banned by
 * design (no exchange rate exists anywhere in this system).
 */
export type CurrencyTotals = Record<string, number>;

/** Sums `pick(row).amount` into the bucket for `pick(row).currency` — same-currency rows combine, different currencies never do. */
export function sumByCurrency<T>(rows: T[], pick: (row: T) => { amount: number; currency: string }): CurrencyTotals {
  const totals: CurrencyTotals = {};
  for (const row of rows) {
    const { amount, currency } = pick(row);
    totals[currency] = (totals[currency] ?? 0) + amount;
  }
  return totals;
}

/** Adds two breakdowns currency-by-currency. A currency present in only one side keeps its own value. */
export function addByCurrency(a: CurrencyTotals, b: CurrencyTotals): CurrencyTotals {
  const out: CurrencyTotals = { ...a };
  for (const [currency, amount] of Object.entries(b)) out[currency] = (out[currency] ?? 0) + amount;
  return out;
}

/** Nets two breakdowns currency-by-currency (`a - b`) — the within-currency subtraction this enables (e.g. invoiced − expenses) is not cross-currency summing. */
export function netByCurrency(a: CurrencyTotals, b: CurrencyTotals): CurrencyTotals {
  const currencies = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: CurrencyTotals = {};
  for (const currency of currencies) out[currency] = (a[currency] ?? 0) - (b[currency] ?? 0);
  return out;
}

/** Floors every bucket at 0 (e.g. "outstanding" shouldn't go negative per currency). */
export function clampNonNegative(totals: CurrencyTotals): CurrencyTotals {
  return Object.fromEntries(Object.entries(totals).map(([currency, amount]) => [currency, Math.max(0, amount)]));
}

/** Margin % per currency present in `invoiced` — computed within that currency only, never blended with another. */
export function marginPctByCurrency(invoiced: CurrencyTotals, netProfit: CurrencyTotals): CurrencyTotals {
  const out: CurrencyTotals = {};
  for (const [currency, amount] of Object.entries(invoiced)) {
    out[currency] = amount ? Math.round(((netProfit[currency] ?? 0) / amount) * 1_000) / 10 : 0;
  }
  return out;
}
