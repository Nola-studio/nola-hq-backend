import { test, expect, describe } from 'bun:test';
import { adaptBillingPayment, summarizePayments } from './momo.summary';

/**
 * Builds an ISO timestamp `daysAgo` days before now, at noon UTC so the
 * YYYY-MM-DD slice lands squarely inside the intended day bucket regardless
 * of the host timezone.
 */
function isoDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

function billingPayment(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pay-' + Math.random().toString(36).slice(2, 8),
    invoiceId: 'inv-1',
    amount: '100',
    currency: 'USD',
    provider: 'mobile_money',
    status: 'succeeded',
    reference: 'ref-1',
    failReason: null,
    createdAt: isoDaysAgo(0),
    invoice: { tenantId: 'tnt-1', realm: 'kelasi', subscription: { app: 'kelasi' } },
    ...over,
  };
}

/** Adapts billing fixtures → ledger rows, then summarizes — the exact path
 *  MomoService.summary() runs after its NATS fan-out. */
function summaryOf(payments: ReturnType<typeof billingPayment>[]) {
  return summarizePayments(payments.map(adaptBillingPayment));
}

describe('summarizePayments', () => {
  test('aggregates totals, reconciliation %, and failed count', () => {
    const s = summaryOf([
      billingPayment({ status: 'succeeded', amount: '100', provider: 'mobile_money' }),
      billingPayment({ status: 'succeeded', amount: '50', provider: 'card' }),
      billingPayment({ status: 'failed', amount: '30', provider: 'mobile_money' }),
      billingPayment({ status: 'pending', amount: '20', provider: 'stripe' }),
    ]);

    expect(s.tx_count).toBe(4);
    expect(s.total_in_cdf).toBe(150); // succeeded only: 100 + 50
    expect(s.total_payout_cdf).toBe(0); // billing has no payouts
    expect(s.failed_count).toBe(1);
    expect(s.reconciled_pct).toBeCloseTo(50); // 2 succeeded / 4 total
  });

  test('nets succeeded amounts per real billing category', () => {
    const s = summaryOf([
      billingPayment({ status: 'succeeded', amount: '100', provider: 'mobile_money' }),
      billingPayment({ status: 'succeeded', amount: '40', provider: 'mobile_money' }),
      billingPayment({ status: 'succeeded', amount: '25', provider: 'card' }),
      billingPayment({ status: 'failed', amount: '999', provider: 'card' }), // excluded
    ]);

    expect(s.net_by_category.mobile_money).toEqual({ net_cdf: 140, tx_count: 2 });
    expect(s.net_by_category.card).toEqual({ net_cdf: 25, tx_count: 1 });
    expect(s.net_by_category.bank_transfer).toEqual({ net_cdf: 0, tx_count: 0 });
  });

  test('buckets the 7-day series by day (index 6 = today, 0 = J-6)', () => {
    const s = summaryOf([
      billingPayment({ status: 'succeeded', amount: '10', provider: 'mobile_money', createdAt: isoDaysAgo(0) }),
      billingPayment({ status: 'succeeded', amount: '5', provider: 'mobile_money', createdAt: isoDaysAgo(6) }),
      billingPayment({ status: 'succeeded', amount: '7', provider: 'card', createdAt: isoDaysAgo(0) }),
      // Older than the window — must not appear in any bucket.
      billingPayment({ status: 'succeeded', amount: '999', provider: 'mobile_money', createdAt: isoDaysAgo(20) }),
    ]);

    const mm = s.by_category_7d.mobile_money;
    expect(mm).toHaveLength(7);
    expect(mm[6]).toBe(10); // today
    expect(mm[0]).toBe(5); // J-6
    expect(mm.reduce((a, b) => a + b, 0)).toBe(15); // J-20 excluded
    expect(s.by_category_7d.card[6]).toBe(7);
  });

  test('returns zeroed metrics when there are no payments', () => {
    const s = summaryOf([]);
    expect(s.tx_count).toBe(0);
    expect(s.reconciled_pct).toBe(0);
    expect(s.total_in_cdf).toBe(0);
    expect(s.by_category_7d.stripe).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});
