import { test, expect, describe } from 'bun:test';
import { toCsv, type ExpenseRow } from './studio.expenses';

function row(overrides: Partial<ExpenseRow> = {}): ExpenseRow {
  return {
    date: '2026-08-01',
    description: 'Hébergement',
    category: 'infra_hosting',
    currency: 'CAD',
    amountCents: 5000,
    recurring: false,
    frequency: null,
    paidByEmail: 'staff@nola.dev',
    ...overrides,
  };
}

describe('toCsv', () => {
  test('emits the header row followed by one line per expense', () => {
    const csv = toCsv([row(), row({ description: 'Domaine', amountCents: 1500 })]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('date,description,category,currency,amount,recurring,frequency,paidByEmail');
    expect(lines).toHaveLength(3);
  });

  test('formats cents as a 2-decimal amount', () => {
    const csv = toCsv([row({ amountCents: 12345 })]);
    expect(csv).toContain('123.45');
  });

  test('quotes and escapes a description containing a comma', () => {
    const csv = toCsv([row({ description: 'Hébergement, VPS' })]);
    expect(csv).toContain('"Hébergement, VPS"');
  });

  test('escapes an embedded double quote by doubling it', () => {
    const csv = toCsv([row({ description: 'Le "meilleur" plan' })]);
    expect(csv).toContain('"Le ""meilleur"" plan"');
  });

  test('renders an empty frequency as an empty field', () => {
    const csv = toCsv([row({ frequency: null })]);
    expect(csv.split('\n')[1].split(',')).toEqual([
      '2026-08-01',
      'Hébergement',
      'infra_hosting',
      'CAD',
      '50.00',
      'false',
      '',
      'staff@nola.dev',
    ]);
  });

  test('an empty list still emits the header', () => {
    expect(toCsv([])).toBe('date,description,category,currency,amount,recurring,frequency,paidByEmail');
  });
});
