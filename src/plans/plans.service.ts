import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { NolaCommandsService } from '@nola-hq/nola-sdk';

/**
 * Raw plan shape returned by nola-billing's `plan.list` admin command.
 * Mirrors the Prisma `Plan` model column-for-column.
 */
export interface BillingPlanRow {
  id: string;
  name: string;
  displayName: string | null;
  price: string;
  currency: string;
  interval: string;
  limits: Record<string, unknown> | null;
  features: unknown[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(private readonly commands: NolaCommandsService) {}

  /**
   * Fan-out to nola-billing for the cross-app plan catalogue. Admin scope
   * means no per-app prefix filter unless `app` is passed in. Returns []
   * if billing is unreachable — the console keeps loading rather than
   * surfacing a 503.
   */
  async listAll(filter: { app?: string } = {}): Promise<BillingPlanRow[]> {
    const reply = await this.commands
      .send<typeof filter, BillingPlanRow[]>(
        'nola.commands.billing.admin.plan.list',
        filter,
        { issuedBy: 'nola-hq', timeoutMs: 5_000 },
      )
      .catch((err: Error) => {
        this.logger.warn(`plan.list NATS call failed: ${err.message}`);
        throw new ServiceUnavailableException({
          code: 'BILLING_UNAVAILABLE',
          message: 'nola-billing is unreachable',
        });
      });

    if (!reply.success) {
      this.logger.warn(
        `plan.list returned error: ${reply.error?.code} ${reply.error?.message}`,
      );
      throw new ServiceUnavailableException({
        code: reply.error?.code ?? 'BILLING_ERROR',
        message: reply.error?.message ?? 'plan.list failed',
      });
    }
    return reply.data ?? [];
  }

  /**
   * Push an edit to nola-billing. The billing handler flips
   * `manuallyEdited=true` automatically (use `unlock: true` to clear it
   * and re-enable manifest sync). Returns the updated row so the HQ
   * console can refresh its view without re-listing the whole catalogue.
   */
  async update(
    id: string,
    patch: {
      displayName?: string;
      price?: number;
      currency?: string;
      interval?: string;
      limits?: Record<string, unknown>;
      features?: unknown[];
      isActive?: boolean;
      unlock?: boolean;
    },
  ): Promise<BillingPlanRow> {
    const payload = { id, ...patch };
    const reply = await this.commands
      .send<typeof payload, BillingPlanRow>(
        'nola.commands.billing.admin.plan.update',
        payload,
        { issuedBy: 'nola-hq', timeoutMs: 5_000 },
      )
      .catch((err: Error) => {
        this.logger.warn(`plan.update NATS call failed: ${err.message}`);
        throw new ServiceUnavailableException({
          code: 'BILLING_UNAVAILABLE',
          message: 'nola-billing is unreachable',
        });
      });
    if (!reply.success) {
      throw new ServiceUnavailableException({
        code: reply.error?.code ?? 'BILLING_ERROR',
        message: reply.error?.message ?? 'plan.update failed',
      });
    }
    return reply.data as BillingPlanRow;
  }
}
