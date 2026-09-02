import { test, expect, describe, mock } from 'bun:test';
import { NotFoundException } from '@nestjs/common';
import { StudioExpensesService } from './studio-expenses.service';

function makeRepo(rows: any[] = []) {
  return {
    find: mock(async (opts?: any) => {
      let res = rows.map((r) => ({ ...r }));
      if (opts?.where?.recurring !== undefined) {
        res = res.filter((r) => r.recurring === opts.where.recurring);
      }
      return res;
    }),
    findOne: mock(async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null),
    create: mock((x: unknown) => x),
    save: mock(async (x: unknown) => x),
    remove: mock(async (x: unknown) => x),
  } as any;
}

describe('StudioExpensesService', () => {
  test('defaults recurring to false and frequency to null on create', async () => {
    const repo = makeRepo();
    const svc = new StudioExpensesService(repo);

    await svc.create({
      description: 'Domaine',
      amountCents: 1500,
      currency: 'USD',
      category: 'domains_saas',
      paidByEmail: 'staff@nola.dev',
      date: '2026-08-01',
    } as any);

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ recurring: false, frequency: null, currency: 'USD' }),
    );
  });

  test('throws NotFoundException when updating a missing expense', async () => {
    const repo = makeRepo();
    const svc = new StudioExpensesService(repo);
    await expect(svc.update('missing', { amountCents: 100 } as any)).rejects.toThrow(NotFoundException);
  });

  test('exportCsv delegates to toCsv with the full expense list', async () => {
    const repo = makeRepo([
      {
        date: '2026-08-01',
        description: 'Hébergement',
        category: 'infra_hosting',
        currency: 'CAD',
        amountCents: 5000,
        recurring: true,
        frequency: 'monthly',
        paidByEmail: 'staff@nola.dev',
      },
    ]);
    const svc = new StudioExpensesService(repo);

    const csv = await svc.exportCsv();

    expect(csv).toContain('date,description,category,currency,amount,recurring,frequency,paidByEmail');
    expect(csv).toContain('50.00');
  });

  test('generateMonthlyRecurring creates concrete rows for recurring templates', async () => {
    const templates = [
      {
        id: 't-1',
        description: 'Proton Mail',
        amountCents: 1200,
        currency: 'USD',
        category: 'domains_saas',
        paidByEmail: 'greg@nola.dev',
        date: '2026-07-15',
        recurring: true,
        frequency: 'monthly',
      },
    ];
    const repo = makeRepo(templates);
    const svc = new StudioExpensesService(repo);

    const result = await svc.generateMonthlyRecurring('2026-09-01');
    expect(result.count).toBe(1);
    expect(result.skipped).toBe(0);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Proton Mail',
        amountCents: 1200,
        currency: 'USD',
        date: '2026-09-15',
        recurring: false,
        templateId: 't-1',
      }),
    );
  });

  test('generateMonthlyRecurring skips already generated templates for the target month', async () => {
    const rows = [
      {
        id: 't-1',
        description: 'Railway',
        amountCents: 2000,
        currency: 'USD',
        category: 'infra_hosting',
        paidByEmail: 'greg@nola.dev',
        date: '2026-08-01',
        recurring: true,
        frequency: 'monthly',
      },
      {
        id: 'inst-1',
        description: 'Railway',
        amountCents: 2000,
        currency: 'USD',
        category: 'infra_hosting',
        paidByEmail: 'greg@nola.dev',
        date: '2026-09-01',
        recurring: false,
        templateId: 't-1',
      },
    ];
    const repo = makeRepo(rows);
    const svc = new StudioExpensesService(repo);

    const result = await svc.generateMonthlyRecurring('2026-09-01');
    expect(result.count).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
