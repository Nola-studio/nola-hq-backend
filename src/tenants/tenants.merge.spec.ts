import { test, expect, describe, mock } from 'bun:test';
mock.module('jose', () => ({
  createRemoteJWKSet: () => () => {},
  jwtVerify: async () => ({ payload: {} }),
}));
mock.module('@nola-hq/nola-sdk', () => ({
  NolaCommandsService: class {},
  NolaClientService: class {},
  NolaAuthService: class {},
}));
const { TenantsService } = await import('./tenants.service');
import type { Repository } from 'typeorm';
import type { TenantCrm } from './tenant-crm.entity';
import type { Invoice } from '../invoices/invoice.entity';
import type { MomoEntry } from '../momo/momo-entry.entity';
import type { Ticket } from '../tickets/ticket.entity';
import type { ActivityEvent } from '../activity/activity.entity';
import type { NolaCommandsService } from '@nola-hq/nola-sdk';
import type { KelasiProvisionClient } from './kelasi-provision.client';
import type { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type { PlansService } from '../plans/plans.service';
import type { IamClientService } from '../iam/iam-client.service';

/**
 * Regression guard for the fix landed on this branch: `findOne()` used to
 * return `users: 0` / `ar_days: 0` for every tenant unconditionally (merge()
 * only sets sync placeholders). This asserts the now-fixed real values, not
 * the old hardcoded-0 behavior — written after the fix, against the fix.
 */

const BILLING_TENANT = {
  id: 'b1',
  externalId: 'ext-1',
  name: 'École Test',
  email: 'owner@example.com',
  realm: 'kelasi',
  organizationId: 'org-1',
  countryCode: 'CD',
  lifecycleState: 'active' as const,
  createdAt: '2025-01-01T00:00:00.000Z',
  subscriptions: [],
};

function makeService(opts: {
  outstandingInvoices?: Array<{ tenantId: string; status: string; dueDate?: string }>;
  memberships?: unknown[];
  membershipsError?: Error;
}) {
  const commands = {
    send: mock(async (subject: string) => {
      if (subject === 'nola.commands.billing.admin.tenant.list') {
        return { success: true, data: [BILLING_TENANT] };
      }
      if (subject === 'nola.commands.billing.admin.invoice.list') {
        return { success: true, data: opts.outstandingInvoices ?? [] };
      }
      throw new Error(`unexpected NATS subject in test: ${subject}`);
    }),
  } as unknown as NolaCommandsService;

  const iam = {
    listMembershipsForOrg: mock(async () => {
      if (opts.membershipsError) throw opts.membershipsError;
      return opts.memberships ?? [];
    }),
  } as unknown as IamClientService;

  const crm = { findOne: mock(async () => null), find: mock(async () => []) } as unknown as Repository<TenantCrm>;

  const service = new TenantsService(
    crm,
    {} as Repository<Invoice>,
    {} as Repository<MomoEntry>,
    {} as Repository<ActivityEvent>,
    commands,
    {} as KelasiProvisionClient,
    {} as SubscriptionsService,
    {} as PlansService,
    iam,
    {} as any,
  );
  return { service, iam };
}

describe('TenantsService.findOne — merge() regression guard', () => {
  test('users reflects real IAM membership count, not the old hardcoded 0', async () => {
    const { service, iam } = makeService({
      memberships: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
    });

    const view = await service.findOne('ext-1');

    expect(view.users).toBe(3);
    expect(iam.listMembershipsForOrg).toHaveBeenCalledWith('org-1', { includeInactive: false });
  });

  test('users reports null (unknown), not 0, when IAM is unreachable', async () => {
    const { service } = makeService({ membershipsError: new Error('iam down') });

    const view = await service.findOne('ext-1');

    expect(view.users).toBeNull();
  });

  test('ar_days reflects the real outstanding-invoice computation, not the old hardcoded 0', async () => {
    const overdueDate = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const { service } = makeService({
      outstandingInvoices: [{ tenantId: 'ext-1', status: 'overdue', dueDate: overdueDate }],
    });

    const view = await service.findOne('ext-1');

    expect(view.ar_days).toBeGreaterThanOrEqual(9);
    expect(view.ar_days).not.toBe(0);
  });

  test('ar_days is 0 (not null/unknown) when the tenant has no outstanding invoices', async () => {
    const { service } = makeService({ outstandingInvoices: [] });

    const view = await service.findOne('ext-1');

    expect(view.ar_days).toBe(0);
  });
});
