import { describe, expect, mock, test } from 'bun:test';
import { InvoicesService } from './invoices.service';
import { Product } from '../company/product.entity';
import { BusinessUnit } from '../company/business-unit.entity';
import { LegalEntity } from '../company/legal-entity.entity';

function makeMockRepo(items: any[] = []) {
  let seq = 0;
  return {
    find: mock(async () => items),
    findOne: mock(async ({ where }: any = {}) => {
      if (where?.id) return items.find((i) => i.id === where.id) ?? null;
      if (where?.code) return items.find((i) => i.code === where.code) ?? null;
      return items[0] ?? null;
    }),
    create: mock((dto: any) => ({ ...dto })),
    save: mock(async (dto: any) => {
      const idx = items.findIndex((i) => i.id === dto.id);
      if (idx >= 0) items[idx] = { ...items[idx], ...dto };
      else items.push(dto);
      return dto;
    }),
    manager: {
      connection: { options: { type: 'postgres' } },
      query: mock(async () => [{ last_value: ++seq }]),
    },
  } as any;
}

describe('InvoicesService — payment.succeeded and branding', () => {
  const legalEntity: LegalEntity = {
    id: 'le-vantelis',
    code: 'vantelis-sas',
    name: 'Vantelis IT SAS',
    jurisdiction: 'QC-CA',
    registrationNumber: '1178923456',
    taxRegime: 'TPS/TVQ',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const businessUnit: BusinessUnit = {
    id: 'bu-vantelis',
    code: 'vantelis-it',
    name: 'Vantelis IT',
    legalEntityId: legalEntity.id,
    legalEntity,
    isActive: true,
    tagline: 'Solutions Cloud & Infra',
    footerLine: 'Vantelis IT | Solutions de confiance',
    theme: 'navy',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const product: Product = {
    id: 'prod-kriver',
    code: 'k-river',
    name: 'K-River',
    businessUnitId: businessUnit.id,
    businessUnit,
    isInternal: false,
    sourceAliases: ['kriver-app'],
    archived: false,
    isProvisionable: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  test('processPaymentSucceeded resolves brand, generates sequential number, renders PDF, and dispatches notification', async () => {
    const invoiceRows: any[] = [];
    const invoiceRepo = makeMockRepo(invoiceRows);
    const productRepo = makeMockRepo([product]);
    const commands = { send: mock(async () => ({ success: true, data: [] })) } as any;

    const publishedEvents: any[] = [];
    const nolaClient = {
      isReady: () => true,
      getClient: () => ({
        publish: mock(async (subject: string, payload: any) => {
          publishedEvents.push({ subject, payload });
        }),
      }),
    } as any;

    const mockPdfBuffer = Buffer.from('%PDF-1.4 test');
    const pdfService = {
      invoice: mock(async () => mockPdfBuffer),
    } as any;

    const service = new InvoicesService(
      invoiceRepo,
      productRepo,
      commands,
      nolaClient,
      pdfService,
    );

    const result = await service.processPaymentSucceeded({
      paymentId: 'pay-12345',
      invoiceId: 'inv-12345',
      amount: 1500,
      currency: 'USD',
      provider: 'mobile_money',
      tenantId: 'tenant-acme',
      appId: 'k-river',
      customerEmail: 'finance@acme.com',
      paidAt: '2026-09-02T20:00:00.000Z',
    });

    expect(result.invoiceNumber).toBe('FAC-2026-00001');
    expect(result.receiptNumber).toBe('REC-2026-00002');
    expect(result.brandName).toBe('Vantelis IT');
    expect(result.legalEntityName).toBe('Vantelis IT SAS');
    expect(result.pdfBuffer).toBe(mockPdfBuffer);
    expect(result.notificationDispatched).toBe(true);

    // Verify PDF service was called with proper BusinessInvoice
    expect(pdfService.invoice).toHaveBeenCalled();
    const pdfArg = (pdfService.invoice as any).mock.calls[0][0];
    expect(pdfArg.number).toBe('FAC-2026-00001');
    expect(pdfArg.businessUnit.name).toBe('Vantelis IT');
    expect(pdfArg.currency).toBe('USD');
    expect(pdfArg.amountCdf).toBe(1500);

    // Verify fire-and-forget notification publish
    expect(publishedEvents.length).toBe(1);
    expect(publishedEvents[0].subject).toBe('nola.commands.notify.send');
    expect(publishedEvents[0].payload.channel).toBe('email');
    expect(publishedEvents[0].payload.to).toBe('finance@acme.com');
    expect(publishedEvents[0].payload.variables.subject).toContain('FAC-2026-00001');

    // Verify local Invoice entity was persisted with correct currency and payment method
    expect(invoiceRows.length).toBe(1);
    expect(invoiceRows[0].id).toBe('inv-12345');
    expect(invoiceRows[0].currency).toBe('USD');
    expect(invoiceRows[0].method).toBe('mobile_money');
    expect(invoiceRows[0].status).toBe('paid');
    expect(invoiceRows[0].amt).toBe(1500);
  });

  test('processPaymentSucceeded resolves product via sourceAliases', async () => {
    const invoiceRepo = makeMockRepo([]);
    const productRepo = makeMockRepo([product]);
    const commands = { send: mock(async () => ({ success: true })) } as any;
    const nolaClient = { isReady: () => false } as any;
    const pdfService = { invoice: mock(async () => Buffer.from('pdf')) } as any;

    const service = new InvoicesService(
      invoiceRepo,
      productRepo,
      commands,
      nolaClient,
      pdfService,
    );

    const result = await service.processPaymentSucceeded({
      amount: 300,
      currency: 'CDF',
      tenantId: 'tenant-beta',
      appId: 'kriver-app', // using source alias
    });

    expect(result.brandName).toBe('Vantelis IT');
    expect(result.invoiceNumber).toBe('FAC-2026-00001');
  });

  test('processPaymentSucceeded FAILS CLOSED when product/brand is unresolvable (zero mock fabrication)', async () => {
    const invoiceRepo = makeMockRepo([]);
    const productRepo = makeMockRepo([]); // no products in DB
    const commands = { send: mock(async () => ({ success: true })) } as any;
    const nolaClient = { isReady: () => true } as any;
    const pdfService = { invoice: mock(async () => Buffer.from('pdf')) } as any;

    const service = new InvoicesService(
      invoiceRepo,
      productRepo,
      commands,
      nolaClient,
      pdfService,
    );

    expect(
      service.processPaymentSucceeded({
        amount: 500,
        currency: 'USD',
        tenantId: 'tenant-orphan',
        appId: 'unknown-app-xyz',
      }),
    ).rejects.toThrow(/Unresolvable brand for product/);
  });

  test('generateSequentialInvoiceNumber formats atomic sequential numbering', async () => {
    const invoiceRepo = makeMockRepo([]);
    const service = new InvoicesService(
      invoiceRepo,
      makeMockRepo([]),
      {} as any,
      {} as any,
      {} as any,
    );

    const num1 = await service.generateSequentialInvoiceNumber(new Date('2026-06-01T00:00:00Z'));
    const num2 = await service.generateSequentialInvoiceNumber(new Date('2026-06-01T00:00:00Z'));
    expect(num1).toBe('FAC-2026-00001');
    expect(num2).toBe('FAC-2026-00002');
  });

  describe('generateUpcomingSubscriptionInvoices (3 days before renewal)', () => {
    test('generates pending invoice 3 days before renewal, renders PDF, and dispatches notification', async () => {
      const now = new Date('2026-09-04T12:00:00.000Z');
      const targetDate = new Date('2026-09-07T12:00:00.000Z');
      const targetDateStr = '2026-09-07';

      const invoiceRows: any[] = [];
      const invoiceRepo = makeMockRepo(invoiceRows);
      const productRepo = makeMockRepo([product]);

      const mockSubscriptions = [
        {
          id: 'sub-target',
          tenantId: 'tenant-acme',
          realm: 'nola-hq',
          app: 'k-river',
          planId: 'plan-1',
          status: 'active',
          startDate: '2026-08-07T00:00:00Z',
          endDate: null,
          nextBillingDate: `${targetDateStr}T00:00:00.000Z`,
          cancelledAt: null,
          plan: {
            id: 'plan-1',
            name: 'Pro',
            displayName: 'Plan Pro',
            price: 500,
            currency: 'USD',
          },
        },
        {
          id: 'sub-later',
          tenantId: 'tenant-other',
          realm: 'nola-hq',
          app: 'k-river',
          planId: 'plan-1',
          status: 'active',
          startDate: '2026-08-10T00:00:00Z',
          endDate: null,
          nextBillingDate: '2026-09-10T00:00:00.000Z', // 6 days away
          cancelledAt: null,
          plan: { id: 'plan-1', name: 'Pro', price: 500, currency: 'USD' },
        },
        {
          id: 'sub-inactive',
          tenantId: 'tenant-inactive',
          realm: 'nola-hq',
          app: 'k-river',
          planId: 'plan-1',
          status: 'cancelled',
          startDate: '2026-08-07T00:00:00Z',
          endDate: null,
          nextBillingDate: `${targetDateStr}T00:00:00.000Z`,
          cancelledAt: '2026-08-20T00:00:00Z',
        },
      ];

      const commands = {
        send: mock(async () => ({ success: true, data: mockSubscriptions })),
      } as any;

      const publishedEvents: any[] = [];
      const nolaClient = {
        isReady: () => true,
        getClient: () => ({
          publish: mock(async (subject: string, payload: any) => {
            publishedEvents.push({ subject, payload });
          }),
        }),
      } as any;

      const mockPdfBuffer = Buffer.from('%PDF-1.4 test');
      const pdfService = {
        invoice: mock(async () => mockPdfBuffer),
      } as any;

      const service = new InvoicesService(
        invoiceRepo,
        productRepo,
        commands,
        nolaClient,
        pdfService,
      );

      const generated = await service.generateUpcomingSubscriptionInvoices(targetDate);

      expect(generated.length).toBe(1);
      expect(generated[0].id).toBe('FAC-2026-00001');
      expect(generated[0].tenant).toBe('tenant-acme');
      expect(generated[0].subscriptionId).toBe('sub-target');
      expect(generated[0].amt).toBe(500);
      expect(generated[0].currency).toBe('USD');
      expect(generated[0].status).toBe('pending');
      expect(generated[0].due).toBe(targetDateStr);

      // Verify PDF rendered
      expect(pdfService.invoice).toHaveBeenCalled();
      const pdfArg = (pdfService.invoice as any).mock.calls[0][0];
      expect(pdfArg.number).toBe('FAC-2026-00001');
      /**
       * « Brouillon », pas « pending ».
       *
       * Le statut du modèle de rendu est imprimé sur le PDF via
       * `INVOICE_STATUS_LABELS`, qui ne connaît que les six états de l'entité —
       * « pending » n'en fait pas partie et sortait « Statut : undefined » sur
       * le document. Le ticket en base garde son propre « pending » : c'est
       * une autre table, avec ses propres états (ligne 301).
       */
      expect(pdfArg.status).toBe('draft');
      expect(pdfArg.dueOn).toBe(targetDateStr);

      // Verify notification dispatched to admin@tenant.nola.cd
      expect(publishedEvents.length).toBe(1);
      expect(publishedEvents[0].payload.to).toBe('admin@tenant-acme.nola.cd');
      expect(publishedEvents[0].payload.idempotencyKey).toBe(`upcoming-invoice-sub-target-${targetDateStr}`);
    });

    test('is idempotent: skips generating when non-cancelled invoice already exists for (subscriptionId, due)', async () => {
      const targetDate = new Date('2026-09-07T12:00:00.000Z');
      const targetDateStr = '2026-09-07';

      const existingInvoice = {
        id: 'FAC-2026-00099',
        tenant: 'tenant-acme',
        subscriptionId: 'sub-target',
        due: targetDateStr,
        status: 'pending',
        amt: 500,
        currency: 'USD',
      };

      const invoiceRows: any[] = [existingInvoice];
      const invoiceRepo = {
        ...makeMockRepo(invoiceRows),
        findOne: mock(async ({ where }: any = {}) => {
          if (where?.subscriptionId === 'sub-target' && where?.due === targetDateStr) {
            return existingInvoice;
          }
          return null;
        }),
      };
      const productRepo = makeMockRepo([product]);

      const mockSubscriptions = [
        {
          id: 'sub-target',
          tenantId: 'tenant-acme',
          realm: 'nola-hq',
          app: 'k-river',
          planId: 'plan-1',
          status: 'active',
          nextBillingDate: `${targetDateStr}T00:00:00.000Z`,
          plan: { price: 500, currency: 'USD' },
        },
      ];

      const commands = {
        send: mock(async () => ({ success: true, data: mockSubscriptions })),
      } as any;
      const pdfService = { invoice: mock(async () => Buffer.from('pdf')) } as any;

      const service = new InvoicesService(
        invoiceRepo as any,
        productRepo,
        commands,
        { isReady: () => false } as any,
        pdfService,
      );

      const generated = await service.generateUpcomingSubscriptionInvoices(targetDate);
      expect(generated.length).toBe(0);
      expect(pdfService.invoice).not.toHaveBeenCalled();
    });

    test('fails closed without crashing when brand is unresolvable', async () => {
      const targetDate = new Date('2026-09-07T12:00:00.000Z');
      const targetDateStr = '2026-09-07';

      const invoiceRepo = makeMockRepo([]);
      const productRepo = makeMockRepo([]); // no products found

      const mockSubscriptions = [
        {
          id: 'sub-orphan',
          tenantId: 'tenant-orphan',
          app: 'unregistered-app',
          status: 'active',
          nextBillingDate: `${targetDateStr}T00:00:00.000Z`,
          plan: { price: 100, currency: 'USD' },
        },
      ];

      const commands = {
        send: mock(async () => ({ success: true, data: mockSubscriptions })),
      } as any;
      const pdfService = { invoice: mock(async () => Buffer.from('pdf')) } as any;

      const service = new InvoicesService(
        invoiceRepo,
        productRepo,
        commands,
        { isReady: () => false } as any,
        pdfService,
      );

      const generated = await service.generateUpcomingSubscriptionInvoices(targetDate);
      expect(generated.length).toBe(0);
    });
  });
});


