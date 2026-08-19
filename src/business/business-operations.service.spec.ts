import { test, expect, describe, mock } from 'bun:test';
import { BusinessOperationsService } from './business-operations.service';

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    find: mock(async () => []),
    findOne: mock(async () => null),
    create: mock((x: unknown) => ({ ...(x as object) })),
    save: mock(async (x: unknown) => x),
    delete: mock(async () => ({})),
    exist: mock(async () => true),
    ...overrides,
  } as any;
}

/**
 * `convertQuote()` used to flatten a quote's tax into a synthetic
 * "Taxe (X%)" line item on the invoice. Now the invoice carries real
 * taxRate/taxCdf fields (mirroring BusinessQuote), so conversion should
 * copy the rate across and pass only the real service lines.
 */
function makeService(quote: any, createInvoice: ReturnType<typeof mock>) {
  const quotes = makeRepo({ findOne: mock(async () => quote) });
  const business = { createInvoice } as any;
  const svc = new BusinessOperationsService(
    quotes, // quotes
    makeRepo(), // quoteLines
    makeRepo(), // documents
    makeRepo(), // reminders
    makeRepo(), // timeEntries
    makeRepo(), // clients
    makeRepo(), // opportunities
    makeRepo(), // contracts
    makeRepo(), // invoices
    makeRepo(), // expenses
    makeRepo(), // projects
    makeRepo(), // workItems
    {} as any, // dataSource (unused on this path — quote is already 'accepted')
    business,
    {} as any, // pdf
  );
  return svc;
}

describe('BusinessOperationsService.convertQuote — tax handling', () => {
  test('copies the quote taxRate onto the invoice and sends real lines only, no synthetic tax line', async () => {
    const quote = {
      id: 'quote-1',
      number: 'DEV-1',
      title: 'Refonte site',
      clientId: 'client-1',
      projectId: 'project-1',
      currency: 'USD',
      status: 'accepted', // skip the updateQuote('accepted') branch entirely
      taxRate: 15,
      taxCdf: 150,
      subtotalCdf: 1_000,
      totalCdf: 1_150,
      lines: [
        { description: 'Design', quantity: 1, unitPriceCdf: 400, totalCdf: 400, position: 0 },
        { description: 'Développement', quantity: 1, unitPriceCdf: 600, totalCdf: 600, position: 1 },
      ],
    };
    const createInvoice = mock(async (dto: any) => ({ id: 'inv-1', ...dto }));
    const svc = makeService(quote, createInvoice);

    await svc.convertQuote('quote-1', { dueOn: '2026-09-01' } as any);

    expect(createInvoice).toHaveBeenCalledTimes(1);
    const dto = createInvoice.mock.calls[0][0];
    expect(dto.amountCdf).toBe(1_150);
    expect(dto.taxRate).toBe(15);
    expect(dto.lines).toEqual([
      { description: 'Design', quantity: 1, unitPriceCdf: 400 },
      { description: 'Développement', quantity: 1, unitPriceCdf: 600 },
    ]);
    // No synthetic "Taxe (...)"-style entry riding along with the real lines.
    expect(dto.lines).toHaveLength(2);
  });

  test('a zero-tax quote still copies taxRate: 0 explicitly', async () => {
    const quote = {
      id: 'quote-2',
      number: 'DEV-2',
      title: 'Support',
      clientId: 'client-1',
      projectId: 'project-1',
      currency: 'USD',
      status: 'accepted',
      taxRate: 0,
      taxCdf: 0,
      subtotalCdf: 500,
      totalCdf: 500,
      lines: [{ description: 'Support mensuel', quantity: 1, unitPriceCdf: 500, totalCdf: 500, position: 0 }],
    };
    const createInvoice = mock(async (dto: any) => ({ id: 'inv-2', ...dto }));
    const svc = makeService(quote, createInvoice);

    await svc.convertQuote('quote-2', { dueOn: '2026-09-01' } as any);

    const dto = createInvoice.mock.calls[0][0];
    expect(dto.taxRate).toBe(0);
    expect(dto.amountCdf).toBe(500);
  });
});
