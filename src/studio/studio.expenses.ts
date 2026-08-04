/**
 * Pure CSV serialization for `GET /studio/expenses/export.csv` — no Nest/DB
 * deps, unit-tested standalone (same split as `studio.board.ts`).
 */

export interface ExpenseRow {
  date: string;
  description: string;
  category: string;
  currency: string;
  amountCents: number;
  recurring: boolean;
  frequency: string | null;
  paidByEmail: string;
}

export function toCsv(rows: ExpenseRow[]): string {
  const header = [
    'date',
    'description',
    'category',
    'currency',
    'amount',
    'recurring',
    'frequency',
    'paidByEmail',
  ];
  const lines = rows.map((r) =>
    [
      r.date,
      csvEscape(r.description),
      r.category,
      r.currency,
      (r.amountCents / 100).toFixed(2),
      r.recurring ? 'true' : 'false',
      r.frequency ?? '',
      r.paidByEmail,
    ].join(','),
  );
  return [header.join(','), ...lines].join('\n');
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
