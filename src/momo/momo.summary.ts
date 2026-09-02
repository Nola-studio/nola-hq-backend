/**
 * Pure payment-ledger aggregation — no Nest/SDK deps so it can be unit-tested
 * in isolation (`bun test`). MomoService wires the NATS fan-out and delegates
 * the number-crunching here.
 */

/**
 * Raw shape emitted by nola-billing's admin `payment.list` command — mirrors
 * the Prisma Payment model with the invoice → subscription chain joined in so
 * each payment can be attributed to a tenant + app.
 */
export interface BillingPayment {
  id: string;
  invoiceId: string;
  amount: string;
  currency: string;
  /** Payment rail category — mobile_money / card / bank_transfer / stripe. */
  provider: string;
  /** pending / succeeded / failed / voided / suspended / recovered. */
  status: string;
  reference?: string | null;
  failReason?: string | null;
  createdAt: string;
  invoice?: {
    tenantId: string;
    realm: string;
    subscription?: { app: string } | null;
  } | null;
}

/**
 * HQ-facing payment ledger row. `category` is the real billing rail (not the
 * specific MoMo operator — billing doesn't persist M-Pesa vs Airtel); `status`
 * is the canonical Payment lifecycle state used to drive reconciliation.
 */
export interface MomoRow {
  id: string;
  ts: string;
  category: string;
  status: string;
  tenant: string | null;
  app: string | null;
  amt: number;
  /** ISO 4217 code as recorded by billing — never assume USD/CDF. */
  currency: string;
  ref: string;
  failReason: string | null;
  invoiceId: string;
  realm: string | null;
}

export const CATEGORIES = ['mobile_money', 'card', 'bank_transfer', 'stripe'] as const;

export interface MomoSummary {
  /** Sum of succeeded amounts across all categories/currencies. Only
   *  meaningful when every contributing row shares one currency — mixed
   *  input still sums numerically (no conversion), so treat this as a
   *  raw total, not a single well-defined amount, unless `total_currency`
   *  confirms uniformity. */
  total_in_cdf: number;
  /** Currency of `total_in_cdf` if every succeeded row shares one, else
   *  null (mixed currencies were summed — display should flag this rather
   *  than pick one currency's symbol). */
  total_currency: string | null;
  total_payout_cdf: number;
  tx_count: number;
  reconciled_pct: number;
  failed_count: number;
  by_category_7d: Record<string, number[]>;
  net_by_category: Record<string, { net_cdf: number; tx_count: number; currency: string | null }>;
}

/**
 * Bridge between nola-billing's canonical Payment shape and the HQ ledger row
 * the Mobile Money view expects.
 */
export function adaptBillingPayment(p: BillingPayment): MomoRow {
  return {
    id: p.id,
    ts: p.createdAt,
    category: p.provider,
    status: p.status,
    tenant: p.invoice?.tenantId ?? null,
    app: p.invoice?.subscription?.app ?? null,
    amt: Math.round(Number(p.amount ?? 0)),
    currency: p.currency,
    ref: p.reference ?? p.id,
    failReason: p.failReason ?? null,
    invoiceId: p.invoiceId,
    realm: p.invoice?.realm ?? null,
  };
}

/** Tracks a running currency for a group of rows: the shared code while every
 *  row agrees, `null` from the first disagreement onward (mixed). */
function trackCurrency(current: string | null | undefined, next: string): string | null {
  if (current === undefined) return next;
  return current === next ? current : null;
}

export function summarizePayments(rows: MomoRow[]): MomoSummary {
  const succeeded = rows.filter((r) => r.status === 'succeeded');
  const failed = rows.filter((r) => r.status === 'failed');
  const total = rows.length;

  const byCategory7d: Record<string, number[]> = {};
  const netByCategory: Record<string, { net_cdf: number; tx_count: number; currency: string | null }> = {};
  const categoryCurrency: Record<string, string | null | undefined> = {};
  for (const cat of CATEGORIES) {
    byCategory7d[cat] = new Array(7).fill(0);
    netByCategory[cat] = { net_cdf: 0, tx_count: 0, currency: null };
  }

  // Daily buckets J-6 → J0 (index 6 = today), keyed off the row timestamp.
  const dayKeys = last7DayKeys();
  let totalCurrency: string | null | undefined;
  for (const r of succeeded) {
    const cat = (CATEGORIES as readonly string[]).includes(r.category)
      ? r.category
      : 'mobile_money';
    netByCategory[cat].net_cdf += r.amt;
    netByCategory[cat].tx_count += 1;
    categoryCurrency[cat] = trackCurrency(categoryCurrency[cat], r.currency);
    totalCurrency = trackCurrency(totalCurrency, r.currency);
    const idx = dayKeys.indexOf((r.ts ?? '').slice(0, 10));
    if (idx >= 0) byCategory7d[cat][idx] += r.amt;
  }
  for (const cat of CATEGORIES) {
    netByCategory[cat].currency = categoryCurrency[cat] ?? null;
  }

  return {
    total_in_cdf: succeeded.reduce((s, r) => s + r.amt, 0),
    total_currency: totalCurrency ?? null,
    total_payout_cdf: 0, // billing has no payout/treasury concept
    tx_count: total,
    reconciled_pct: total ? (succeeded.length / total) * 100 : 0,
    failed_count: failed.length,
    by_category_7d: byCategory7d,
    net_by_category: netByCategory,
  };
}

/** YYYY-MM-DD keys for the last 7 days, oldest (J-6) → newest (J0). */
export function last7DayKeys(): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}
