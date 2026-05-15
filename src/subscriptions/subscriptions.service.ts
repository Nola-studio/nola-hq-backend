import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { NolaCommandsService } from '@nola-hq/nola-sdk';

/**
 * Raw subscription shape returned by nola-billing's admin commands.
 * Mirrors the Prisma Subscription model + the eager-loaded plan join.
 */
export interface BillingSubscriptionRow {
  id: string;
  tenantId: string;
  realm: string;
  app: string;
  planId: string;
  status: string;
  startDate: string;
  endDate: string | null;
  nextBillingDate: string | null;
  cancelledAt: string | null;
  plan?: {
    id: string;
    name: string;
    displayName: string | null;
    price: string | number;
    currency: string;
  };
}

/**
 * Admin-only client for tenant subscription lifecycle. All calls hit
 * `nola.commands.billing.admin.subscription.*` — the same NATS perms
 * already granted to the `nola` user. Returns the canonical subscription
 * row so the HQ console can refresh its tenant detail view with the
 * post-change state.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(private readonly commands: NolaCommandsService) {}

  list(filter: {
    app?: string;
    status?: string;
    tenantId?: string;
    limit?: number;
  } = {}): Promise<BillingSubscriptionRow[]> {
    return this.send<typeof filter, BillingSubscriptionRow[]>(
      'nola.commands.billing.admin.subscription.list',
      filter,
    );
  }

  get(tenantId: string, app: string): Promise<BillingSubscriptionRow> {
    return this.send<{ tenantId: string; app: string }, BillingSubscriptionRow>(
      'nola.commands.billing.admin.subscription.get',
      { tenantId, app },
    );
  }

  changePlan(args: {
    subscriptionId?: string;
    tenantId?: string;
    app?: string;
    newPlanId: string;
    reason?: string;
  }): Promise<BillingSubscriptionRow> {
    return this.send<typeof args, BillingSubscriptionRow>(
      'nola.commands.billing.admin.subscription.change_plan',
      args,
    );
  }

  cancel(args: {
    subscriptionId?: string;
    tenantId?: string;
    app?: string;
  }): Promise<BillingSubscriptionRow> {
    return this.send<typeof args, BillingSubscriptionRow>(
      'nola.commands.billing.admin.subscription.cancel',
      args,
    );
  }

  private async send<TReq, TRes>(subject: string, payload: TReq): Promise<TRes> {
    const reply = await this.commands
      .send<TReq, TRes>(subject, payload, {
        issuedBy: 'nola-hq',
        timeoutMs: 5_000,
      })
      .catch((err: Error) => {
        this.logger.warn(`${subject} NATS call failed: ${err.message}`);
        throw new ServiceUnavailableException({
          code: 'BILLING_UNAVAILABLE',
          message: 'nola-billing is unreachable',
        });
      });
    if (!reply.success) {
      throw new ServiceUnavailableException({
        code: reply.error?.code ?? 'BILLING_ERROR',
        message: reply.error?.message ?? `${subject} failed`,
      });
    }
    return reply.data as TRes;
  }
}
