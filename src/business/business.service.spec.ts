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
