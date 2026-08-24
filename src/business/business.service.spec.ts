import { test, expect, describe, mock } from 'bun:test';
import { BadRequestException } from '@nestjs/common';
import { BusinessInvoice, BusinessInvoiceLine } from './business-invoice.entity';
import { BusinessService } from './business.service';

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
 * `createInvoice`/`updateInvoice` run inside `this.dataSource.transaction`,
 * grabbing repos off the transaction manager rather than the injected ones —
 * this fake mirrors that indirection so line/invoice saves land on the right
 * capture arrays for assertions. `connection`/`query` back `nextBusinessNumber`
 * (see business-number-sequence.spec.ts for that function's own tests) —
 * here it just needs to hand back an incrementing number without erroring.
 */
function makeDataSource(invoiceRepo: any, lineRepo: any) {
  let lastValue = 0;
  return {
    transaction: async (fn: (manager: any) => Promise<any>) =>
      fn({
        getRepository: (entity: unknown) => (entity === BusinessInvoiceLine ? lineRepo : invoiceRepo),
        connection: { options: { type: 'postgres' } },
        query: mock(async () => [{ last_value: ++lastValue }]),
      }),
  } as any;
}

function makeService(opts: {
  invoicesFindOne?: (args: any) => any;
  invoiceRepoSave?: any;
  lineRepoSave?: any;
} = {}) {
  const client = makeRepo({ findOne: mock(async () => ({ id: 'client-1' })) });
  const project = makeRepo({ findOne: mock(async () => ({ id: 'project-1' })) });
  const invoices = makeRepo({
    findOne: mock(async (args: any) => {
      const custom = opts.invoicesFindOne?.(args);
      if (custom !== undefined) return custom;
      // No conflict on number lookups; a fresh stub for reload-by-id lookups (findInvoice()).
      if (args.where?.id) return { id: args.where.id, lines: [] };
      return null;
    }),
  });
  const invoiceRepoTx = makeRepo({
    create: mock((x: any) => ({ ...x })),
    save: opts.invoiceRepoSave ?? mock(async (x: any) => ({ id: 'inv-1', lines: [], ...x })),
  });
  const lineRepoTx = makeRepo({
    create: mock((x: any) => ({ ...x })),
    save: opts.lineRepoSave ?? mock(async (x: any) => x),
  });
  const dataSource = makeDataSource(invoiceRepoTx, lineRepoTx);

  const svc = new BusinessService(
    client, // clients
    makeRepo(), // opportunities
    makeRepo(), // contracts
    makeRepo(), // budgets
    makeRepo(), // expenses
    invoices, // invoices
    makeRepo(), // invoiceLines (outer, unused by these paths)
    project, // projects
    makeRepo(), // timeEntries
    makeRepo(), // workItems
    makeRepo(), // risks
    makeRepo(), // documents
    makeRepo(), // reminders
    dataSource,
    { resolve: mock(async () => 'bu-1') } as any, // businessUnits
  );
  return { svc, invoices, invoiceRepoTx, lineRepoTx };
}

const baseDto = {
  clientId: 'client-1',
  projectId: 'project-1',
  issuedOn: '2026-08-01',
  dueOn: '2026-08-15',
};

describe('BusinessService — invoice line/tax totals', () => {
  test('createInvoice rejects when lines + tax do not sum to amountCdf', async () => {
    const { svc } = makeService();
    await expect(
      svc.createInvoice({
        ...baseDto,
        amountCdf: 1_000,
        taxRate: 10,
        lines: [{ description: 'Dev', quantity: 1, unitPriceCdf: 900 }],
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  test('createInvoice computes taxCdf from the lines subtotal and taxRate', async () => {
    const { svc, invoiceRepoTx, lineRepoTx } = makeService();
    // subtotal = 1000, taxRate 10% -> taxCdf 100, total 1100
    await svc.createInvoice({
      ...baseDto,
      amountCdf: 1_100,
      taxRate: 10,
      lines: [{ description: 'Dev', quantity: 2, unitPriceCdf: 500 }],
    } as any);

    expect(invoiceRepoTx.save).toHaveBeenCalledWith(
      expect.objectContaining({ amountCdf: 1_100, taxRate: 10, taxCdf: 100 }),
    );
    expect(lineRepoTx.save).toHaveBeenCalledWith([
      expect.objectContaining({ description: 'Dev', quantity: 2, unitPriceCdf: 500, totalCdf: 1_000, position: 0 }),
    ]);
  });

  test('createInvoice rejects a positive taxRate without lines', async () => {
    const { svc } = makeService();
    await expect(
      svc.createInvoice({ ...baseDto, amountCdf: 1_000, taxRate: 10 } as any),
    ).rejects.toThrow(BadRequestException);
  });

  test('createInvoice allows a lineless invoice with no tax, as before', async () => {
    const { svc, invoiceRepoTx } = makeService();
    await svc.createInvoice({ ...baseDto, amountCdf: 1_000 } as any);
    expect(invoiceRepoTx.save).toHaveBeenCalledWith(expect.objectContaining({ amountCdf: 1_000, taxRate: 0, taxCdf: 0 }));
  });

  test('updateInvoice re-validates tax against the existing lines when only amountCdf changes', async () => {
    const existing: Partial<BusinessInvoice> = {
      id: 'inv-1',
      amountCdf: 1_100,
      paidAmountCdf: 0,
      taxRate: 10,
      taxCdf: 100,
      status: 'draft',
      issuedOn: '2026-08-01',
      dueOn: '2026-08-15',
      clientId: 'client-1',
      projectId: 'project-1',
      contractId: null,
      number: 'FAC-1',
      lines: [{ id: 'line-1', invoiceId: 'inv-1', description: 'Dev', quantity: 2, unitPriceCdf: 500, totalCdf: 1_000, position: 0 } as BusinessInvoiceLine],
    };
    const { svc } = makeService({
      invoicesFindOne: (args: any) => (args.where?.id === 'inv-1' ? existing : null),
    });
    // Existing subtotal (1000) + existing taxRate (10%) => 1100, but caller now claims amountCdf 5000.
    await expect(svc.updateInvoice('inv-1', { amountCdf: 5_000 } as any)).rejects.toThrow(BadRequestException);
  });
});

describe('BusinessService — markPaid / receipted-invoice lock', () => {
  test('markPaid mints a receipt number/token, sets payment metadata, and locks paidAmountCdf to amountCdf', async () => {
    const existing: Partial<BusinessInvoice> = {
      id: 'inv-1', amountCdf: 1_000, paidAmountCdf: 0, taxRate: 0, taxCdf: 0,
      status: 'sent', receiptNumber: null, paymentMethod: null, paymentReference: null,
      verificationToken: null, paidAt: null, lines: [],
    };
    const { svc, invoiceRepoTx } = makeService({
      invoicesFindOne: (args: any) => (args.where?.id === 'inv-1' ? existing : null),
    });

    const result = await svc.markPaid('inv-1', { paymentMethod: 'cash', paymentReference: 'REF-1' } as any);

    expect(result.status).toBe('paid');
    expect(result.paidAmountCdf).toBe(1_000);
    expect(result.receiptNumber).toMatch(/^REC-\d{4}-\d{5}$/);
    expect(result.verificationToken).toBeTruthy();
    expect(result.paymentMethod).toBe('cash');
    expect(result.paymentReference).toBe('REF-1');
    expect(invoiceRepoTx.save).toHaveBeenCalled();
  });

  test('markPaid rejects an invoice that already has a receipt', async () => {
    const existing: Partial<BusinessInvoice> = {
      id: 'inv-1', status: 'paid', receiptNumber: 'REC-2026-00001', amountCdf: 1_000, paidAmountCdf: 1_000,
    };
    const { svc } = makeService({ invoicesFindOne: (args: any) => (args.where?.id === 'inv-1' ? existing : null) });
    await expect(svc.markPaid('inv-1', { paymentMethod: 'cash' } as any)).rejects.toThrow(BadRequestException);
  });

  test('markPaid rejects a cancelled invoice', async () => {
    const existing: Partial<BusinessInvoice> = {
      id: 'inv-1', status: 'cancelled', receiptNumber: null, amountCdf: 1_000, paidAmountCdf: 0,
    };
    const { svc } = makeService({ invoicesFindOne: (args: any) => (args.where?.id === 'inv-1' ? existing : null) });
    await expect(svc.markPaid('inv-1', { paymentMethod: 'cash' } as any)).rejects.toThrow(BadRequestException);
  });

  test('updateInvoice rejects amount/line changes once a receipt has been issued', async () => {
    const existing: Partial<BusinessInvoice> = {
      id: 'inv-1', amountCdf: 1_000, paidAmountCdf: 1_000, taxRate: 0, taxCdf: 0,
      status: 'paid', receiptNumber: 'REC-2026-00001', issuedOn: '2026-08-01', dueOn: '2026-08-15',
      clientId: 'client-1', projectId: 'project-1', contractId: null, number: 'FAC-1', lines: [],
    };
    const { svc } = makeService({ invoicesFindOne: (args: any) => (args.where?.id === 'inv-1' ? existing : null) });
    await expect(svc.updateInvoice('inv-1', { amountCdf: 2_000 } as any)).rejects.toThrow(BadRequestException);
  });

  test('updateInvoice still allows non-financial edits once receipted', async () => {
    const existing: Partial<BusinessInvoice> = {
      id: 'inv-1', amountCdf: 1_000, paidAmountCdf: 1_000, taxRate: 0, taxCdf: 0,
      status: 'paid', receiptNumber: 'REC-2026-00001', issuedOn: '2026-08-01', dueOn: '2026-08-15',
      clientId: 'client-1', projectId: 'project-1', contractId: null, number: 'FAC-1', lines: [],
    };
    const { svc } = makeService({ invoicesFindOne: (args: any) => (args.where?.id === 'inv-1' ? existing : null) });
    const result = await svc.updateInvoice('inv-1', { description: 'Note updated' } as any);
    expect(result.description).toBe('Note updated');
  });

  test('voidReceipt sets receiptVoidedAt but keeps receiptNumber/verificationToken resolvable', async () => {
    const existing: Partial<BusinessInvoice> = {
      id: 'inv-1', amountCdf: 1_000, paidAmountCdf: 1_000, status: 'paid',
      receiptNumber: 'REC-2026-00001', verificationToken: 'tok-abc', receiptVoidedAt: null, lines: [],
    };
    const { svc } = makeService({ invoicesFindOne: (args: any) => (args.where?.id === 'inv-1' ? existing : null) });
    const result = await svc.voidReceipt('inv-1');
    expect(result.receiptVoidedAt).toBeInstanceOf(Date);
    expect(result.receiptNumber).toBe('REC-2026-00001');
    expect(result.verificationToken).toBe('tok-abc');
  });

  test('voidReceipt rejects an invoice with no receipt to void', async () => {
    const existing: Partial<BusinessInvoice> = { id: 'inv-1', receiptNumber: null };
    const { svc } = makeService({ invoicesFindOne: (args: any) => (args.where?.id === 'inv-1' ? existing : null) });
    await expect(svc.voidReceipt('inv-1')).rejects.toThrow(BadRequestException);
  });

  test('voidReceipt rejects a receipt that is already voided', async () => {
    const existing: Partial<BusinessInvoice> = {
      id: 'inv-1', receiptNumber: 'REC-2026-00001', receiptVoidedAt: new Date('2026-08-12T00:00:00Z'),
    };
    const { svc } = makeService({ invoicesFindOne: (args: any) => (args.where?.id === 'inv-1' ? existing : null) });
    await expect(svc.voidReceipt('inv-1')).rejects.toThrow(BadRequestException);
  });
});
