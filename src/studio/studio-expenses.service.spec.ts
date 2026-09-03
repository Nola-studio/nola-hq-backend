import { test, expect, describe, mock } from 'bun:test';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StudioExpensesService } from './studio-expenses.service';
import { ConfigService } from '@nestjs/config';

function makeRepo(rows: any[] = []) {
  return {
    find: mock(async (opts?: any) => {
      let res = rows.map((r) => ({ ...r }));
      if (opts?.where?.recurring !== undefined) {
        res = res.filter((r) => r.recurring === opts.where.recurring);
      }
      if (opts?.where?.source !== undefined) {
        res = res.filter((r) => r.source === opts.where.source);
      }
      return res;
    }),
    findOne: mock(async ({ where }: any) => {
      return (
        rows.find((r) => {
          if (where.id && r.id !== where.id) return false;
          if (where.externalInvoiceId && r.externalInvoiceId !== where.externalInvoiceId) return false;
          if (where.workspace && r.workspace !== where.workspace) return false;
          if (where.description && r.description !== where.description) return false;
          if (where.recurring !== undefined && r.recurring !== where.recurring) return false;
          return true;
        }) ?? null
      );
    }),
    create: mock((x: any) => ({ ...x, id: x.id || 'gen-id-' + Math.random().toString(36).slice(2) })),
    save: mock(async (x: any) => {
      const idx = rows.findIndex((r) => r.id === x.id || (x.externalInvoiceId && r.externalInvoiceId === x.externalInvoiceId));
      if (idx >= 0) {
        rows[idx] = { ...rows[idx], ...x };
      } else {
        rows.push({ ...x, id: x.id || 'id-' + rows.length });
      }
      return x;
    }),
    remove: mock(async (x: any) => {
      const idx = rows.findIndex((r) => r.id === x.id);
      if (idx >= 0) rows.splice(idx, 1);
      return x;
    }),
  } as any;
}

describe('StudioExpensesService', () => {
  const config = new ConfigService();

  test('defaults recurring to false and frequency to null on create', async () => {
    const repo = makeRepo();
    const svc = new StudioExpensesService(repo, config);

    const res = await svc.create({
      description: 'Domaine',
      amountCents: 1500,
      currency: 'USD',
      category: 'domains_saas',
      paidByEmail: 'staff@nola.dev',
      date: '2026-08-01',
    } as any);

    expect(res.expense.recurring).toBe(false);
    expect(res.expense.frequency).toBeNull();
    expect(res.expense.source).toBe('manual');
    expect(res.duplicateWarning).toBeUndefined();
  });

  test('returns soft duplicate warning on manual expense when close to a Railway invoice', async () => {
    const repo = makeRepo([
      {
        id: 'rw-1',
        description: 'Railway Pro (NolaaStudio-npr) - Facture in_1U61',
        amountCents: 6509,
        currency: 'USD',
        category: 'infra_hosting',
        paidByEmail: 'greg@nola.cd',
        date: '2026-07-19',
        recurring: false,
        source: 'railway',
        externalInvoiceId: 'in_1U61',
      },
    ]);
    const svc = new StudioExpensesService(repo, config);

    // Manual input: $65.00 on 2026-07-20 (within 5% and within 5 days)
    const res = await svc.create({
      description: 'Railway facture juillet',
      amountCents: 6500,
      currency: 'USD',
      category: 'infra_hosting',
      paidByEmail: 'staff@nola.dev',
      date: '2026-07-20',
    } as any);

    expect(res.duplicateWarning).toBeDefined();
    expect(res.duplicateWarning).toContain('Une facture Railway similaire existe déjà');
    expect(res.duplicateWarning).toContain('65.09');
  });

  test('immutability lock: rejects update and delete of source=railway expenses', async () => {
    const repo = makeRepo([
      {
        id: 'rw-locked',
        description: 'Railway Pro (NolaaStudio-npr) - Facture in_1U61',
        amountCents: 6509,
        currency: 'USD',
        category: 'infra_hosting',
        paidByEmail: 'greg@nola.cd',
        date: '2026-07-19',
        recurring: false,
        source: 'railway',
        externalInvoiceId: 'in_1U61',
      },
    ]);
    const svc = new StudioExpensesService(repo, config);

    await expect(svc.update('rw-locked', { amountCents: 1000 })).rejects.toThrow(ForbiddenException);
    await expect(svc.remove('rw-locked')).rejects.toThrow(ForbiddenException);
  });

  test('throws NotFoundException when updating a missing expense', async () => {
    const repo = makeRepo();
    const svc = new StudioExpensesService(repo, config);
    await expect(svc.update('missing', { amountCents: 100 } as any)).rejects.toThrow(NotFoundException);
  });

  test('syncRailwayInvoices imports settled invoices and computes 3-invoice rolling average', async () => {
    const rows: any[] = [
      {
        id: 'tpl-1',
        description: 'Railway Pro (NolaaStudio-npr)',
        amountCents: 4800,
        currency: 'USD',
        category: 'infra_hosting',
        paidByEmail: 'greg@nola.cd',
        date: '2026-08-01',
        recurring: true,
        workspace: 'NolaaStudio-npr (Railway)',
      },
    ];
    const repo = makeRepo(rows);
    const svc = new StudioExpensesService(repo, config);

    // Mock global fetch for Railway GraphQL
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (_url, opts: any) => {
      const body = JSON.parse(opts.body);
      if (body.query.includes('GetWorkspaceInvoices')) {
        return new Response(
          JSON.stringify({
            data: {
              apiToken: {
                workspaces: [{ id: 'ws-npr', name: 'NolaaStudio-npr' }],
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (body.query.includes('GetInvoices')) {
        return new Response(
          JSON.stringify({
            data: {
              workspace: {
                customer: {
                  billingEmail: 'greg@nola.cd',
                  invoices: [
                    {
                      invoiceId: 'inv-aug',
                      amountPaid: 6509,
                      status: 'paid',
                      periodStart: '2026-07-19T04:44:50.000Z',
                      pdfURL: 'https://pay.stripe.com/invoice/inv-aug/pdf',
                    },
                    {
                      invoiceId: 'inv-jul',
                      amountPaid: 5648,
                      status: 'paid',
                      periodStart: '2026-06-19T04:44:50.000Z',
                      pdfURL: 'https://pay.stripe.com/invoice/inv-jul/pdf',
                    },
                    {
                      invoiceId: 'inv-jun',
                      amountPaid: 4376,
                      status: 'paid',
                      periodStart: '2026-05-19T04:44:50.000Z',
                      pdfURL: 'https://pay.stripe.com/invoice/inv-jun/pdf',
                    },
                  ],
                },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 200 });
    }) as any;

    try {
      const res = await svc.syncRailwayInvoices('mock_token');
      expect(res.workspaceName).toBe('NolaaStudio-npr');
      expect(res.syncedInvoicesCount).toBe(3);
      // (65.09 + 56.48 + 43.76) / 3 = 55.11
      expect(res.rollingAverageForecastUsd).toBe(55.11);
      expect(res.forecastBasis.length).toBe(3);
      expect(res.forecastBasis[0].invoiceId).toBe('inv-aug');

      // Check that the template was updated with $55.11 (5511 cents)
      const updatedTemplate = rows.find((r) => r.id === 'tpl-1');
      expect(updatedTemplate.amountCents).toBe(5511);
      expect(updatedTemplate.forecastBasis).toEqual(res.forecastBasis);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
