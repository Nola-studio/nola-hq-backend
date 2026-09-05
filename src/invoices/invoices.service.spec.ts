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
    const mockTenant = {
      id: 'tenant-acme',
      name: 'Acme Corporation',
      email: 'billing@acme.com',
      phone: '+243810000000',
    };

    test('generates pending invoice with real tenant details, and defaults to notify mode "off" (no notify.send)', async () => {
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
        send: mock(async (subject: string, payload: any) => {
          if (subject === 'nola.commands.billing.admin.subscription.list') {
            return { success: true, data: mockSubscriptions };
          }
          if (subject === 'nola.commands.billing.admin.tenant.get') {
            if (payload?.id === 'tenant-acme') return { success: true, data: mockTenant };
          }
          return { success: false, error: { message: 'not found' } };
        }),
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

      // Default mode: no config passed (defaults to 'off')
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

      // Verify PDF rendered with real tenant name and email
      expect(pdfService.invoice).toHaveBeenCalled();
      const pdfArg = (pdfService.invoice as any).mock.calls[0][0];
      expect(pdfArg.number).toBe('FAC-2026-00001');
      expect(pdfArg.status).toBe('pending');
      expect(pdfArg.dueOn).toBe(targetDateStr);
      expect(pdfArg.client.name).toBe('Acme Corporation');
      expect(pdfArg.client.email).toBe('billing@acme.com');
      expect(pdfArg.client.phone).toBe('+243810000000');

      // Verify no notification published under default 'off' mode
      expect(publishedEvents.length).toBe(0);
    });

    test('supports notify mode "override": dispatches notify.send to override address', async () => {
      const targetDate = new Date('2026-09-07T12:00:00.000Z');
      const targetDateStr = '2026-09-07';

      const invoiceRepo = makeMockRepo([]);
      const productRepo = makeMockRepo([product]);

      const mockSubscriptions = [
        {
          id: 'sub-target',
          tenantId: 'tenant-acme',
          app: 'k-river',
          status: 'active',
          nextBillingDate: `${targetDateStr}T00:00:00.000Z`,
          plan: { price: 500, currency: 'USD' },
        },
      ];

      const commands = {
        send: mock(async (subject: string) => {
          if (subject === 'nola.commands.billing.admin.subscription.list') {
            return { success: true, data: mockSubscriptions };
          }
          if (subject === 'nola.commands.billing.admin.tenant.get') {
            return { success: true, data: mockTenant };
          }
          return { success: false };
        }),
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

      const mockConfig = {
        get: (key: string) => {
          if (key === 'INVOICE_NOTIFY_MODE') return 'override';
          if (key === 'INVOICE_NOTIFY_OVERRIDE_EMAIL') return 'dev-test@nola.cd';
          return null;
        },
      } as any;

      const service = new InvoicesService(
        invoiceRepo,
        productRepo,
        commands,
        nolaClient,
        { invoice: mock(async () => Buffer.from('pdf')) } as any,
        mockConfig,
      );

      const generated = await service.generateUpcomingSubscriptionInvoices(targetDate);
      expect(generated.length).toBe(1);

      expect(publishedEvents.length).toBe(1);
      expect(publishedEvents[0].payload.to).toBe('dev-test@nola.cd');
      expect(publishedEvents[0].payload.idempotencyKey).toBe(`upcoming-invoice-sub-target-${targetDateStr}`);
    });

    test('supports notify mode "live": dispatches notify.send to tenant.email', async () => {
      const targetDate = new Date('2026-09-07T12:00:00.000Z');
      const targetDateStr = '2026-09-07';

      const invoiceRepo = makeMockRepo([]);
      const productRepo = makeMockRepo([product]);

      const mockSubscriptions = [
        {
          id: 'sub-target',
          tenantId: 'tenant-acme',
          app: 'k-river',
          status: 'active',
          nextBillingDate: `${targetDateStr}T00:00:00.000Z`,
          plan: { price: 500, currency: 'USD' },
        },
      ];

      const commands = {
        send: mock(async (subject: string) => {
          if (subject === 'nola.commands.billing.admin.subscription.list') {
            return { success: true, data: mockSubscriptions };
          }
          if (subject === 'nola.commands.billing.admin.tenant.get') {
            return { success: true, data: mockTenant };
          }
          return { success: false };
        }),
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

      const mockConfig = {
        get: (key: string) => {
          if (key === 'INVOICE_NOTIFY_MODE') return 'live';
          return null;
        },
      } as any;

      const service = new InvoicesService(
        invoiceRepo,
        productRepo,
        commands,
        nolaClient,
        { invoice: mock(async () => Buffer.from('pdf')) } as any,
        mockConfig,
      );

      const generated = await service.generateUpcomingSubscriptionInvoices(targetDate);
      expect(generated.length).toBe(1);

      expect(publishedEvents.length).toBe(1);
      expect(publishedEvents[0].payload.to).toBe('billing@acme.com');
      expect(publishedEvents[0].payload.idempotencyKey).toBe(`upcoming-invoice-sub-target-${targetDateStr}`);
    });

    test('fails closed when tenant lookup fails: 0 invoices created, 0 sequence numbers consumed', async () => {
      const targetDate = new Date('2026-09-07T12:00:00.000Z');
      const targetDateStr = '2026-09-07';

      const invoiceRepo = makeMockRepo([]);
      const productRepo = makeMockRepo([product]);
      const pdfService = { invoice: mock(async () => Buffer.from('pdf')) } as any;

      const mockSubscriptions = [
        {
          id: 'sub-missing-tenant',
          tenantId: 'tenant-deleted',
          app: 'k-river',
          status: 'active',
          nextBillingDate: `${targetDateStr}T00:00:00.000Z`,
          plan: { price: 500, currency: 'USD' },
        },
      ];

      const commands = {
        send: mock(async (subject: string) => {
          if (subject === 'nola.commands.billing.admin.subscription.list') {
            return { success: true, data: mockSubscriptions };
          }
          if (subject === 'nola.commands.billing.admin.tenant.get') {
            return { success: false, error: { message: 'Tenant not found' } };
          }
          return { success: false };
        }),
      } as any;

      const service = new InvoicesService(
        invoiceRepo,
        productRepo,
        commands,
        { isReady: () => false } as any,
        pdfService,
      );

      const generated = await service.generateUpcomingSubscriptionInvoices(targetDate);
      expect(generated.length).toBe(0);
      expect(pdfService.invoice).not.toHaveBeenCalled();
      expect((invoiceRepo.manager.query as any)).not.toHaveBeenCalled();
    });

    test('fails closed when tenant has no email: 0 invoices created, 0 sequence numbers consumed', async () => {
      const targetDate = new Date('2026-09-07T12:00:00.000Z');
      const targetDateStr = '2026-09-07';

      const invoiceRepo = makeMockRepo([]);
      const productRepo = makeMockRepo([product]);
      const pdfService = { invoice: mock(async () => Buffer.from('pdf')) } as any;

      const mockSubscriptions = [
        {
          id: 'sub-no-email',
          tenantId: 'tenant-no-email',
          app: 'k-river',
          status: 'active',
          nextBillingDate: `${targetDateStr}T00:00:00.000Z`,
          plan: { price: 500, currency: 'USD' },
        },
      ];

      const commands = {
        send: mock(async (subject: string) => {
          if (subject === 'nola.commands.billing.admin.subscription.list') {
            return { success: true, data: mockSubscriptions };
          }
          if (subject === 'nola.commands.billing.admin.tenant.get') {
            return {
              success: true,
              data: { id: 'tenant-no-email', name: 'No Email Org', email: '' },
            };
          }
          return { success: false };
        }),
      } as any;

      const service = new InvoicesService(
        invoiceRepo,
        productRepo,
        commands,
        { isReady: () => false } as any,
        pdfService,
      );

      const generated = await service.generateUpcomingSubscriptionInvoices(targetDate);
      expect(generated.length).toBe(0);
      expect(pdfService.invoice).not.toHaveBeenCalled();
      expect((invoiceRepo.manager.query as any)).not.toHaveBeenCalled();
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


