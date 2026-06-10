import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NolaCommandsService } from '@nola-hq/nola-sdk';
import { MomoEntry } from './momo-entry.entity';
import { CreateMomoDto } from './dto/create-momo.dto';
import { ListMomoDto } from './dto/list-momo.dto';
import {
  adaptBillingPayment,
  summarizePayments,
  type BillingPayment,
  type MomoRow,
} from './momo.summary';
import type { PaginatedResult } from '../common/dto/pagination.dto';

/**
 * MomoService — read path goes through nola-billing via the NATS admin command
 * `nola.commands.billing.admin.payment.list` (same fan-out pattern as
 * InvoicesService). The local `momo_entries` repo is retained only for legacy
 * operator-entered rows via `create()`; it is no longer the source for the
 * Mobile Money view. Aggregation logic lives in `./momo.summary` (SDK-free,
 * unit-tested).
 */
@Injectable()
export class MomoService {
  private readonly logger = new Logger(MomoService.name);

  constructor(
    @InjectRepository(MomoEntry)
    private readonly repo: Repository<MomoEntry>,
    private readonly commands: NolaCommandsService,
  ) {}

  async list(query: ListMomoDto): Promise<PaginatedResult<MomoRow>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const payments = await this.fetchBillingPayments({
      status: query.status,
      provider: query.provider,
      tenantId: query.tenant,
      limit: 1000,
    });
    const rows = payments.map(adaptBillingPayment);
    const total = rows.length;
    const items = rows.slice((page - 1) * limit, page * limit);
    return { items, total, page, limit };
  }

  async create(dto: CreateMomoDto) {
    // Legacy manual-entry path (no billing counterpart). Kept for backward
    // compatibility; the Mobile Money view no longer reads these rows.
    return this.repo.save(this.repo.create({ ...dto, tenant: dto.tenant ?? null }));
  }

  async summary() {
    const payments = await this.fetchBillingPayments({ limit: 1000 });
    return summarizePayments(payments.map(adaptBillingPayment));
  }

  private async fetchBillingPayments(filter: {
    status?: string;
    provider?: string;
    tenantId?: string;
    limit?: number;
  }): Promise<BillingPayment[]> {
    const reply = await this.commands
      .send<typeof filter, BillingPayment[]>(
        'nola.commands.billing.admin.payment.list',
        filter,
        { issuedBy: 'nola-hq', timeoutMs: 5_000 },
      )
      .catch((err: Error) => {
        this.logger.warn(`payment.list NATS call failed: ${err.message}`);
        throw new ServiceUnavailableException({
          code: 'BILLING_UNAVAILABLE',
          message: 'nola-billing is unreachable',
        });
      });
    if (!reply.success) {
      this.logger.warn(
        `payment.list returned error: ${reply.error?.code} ${reply.error?.message}`,
      );
      throw new ServiceUnavailableException({
        code: reply.error?.code ?? 'BILLING_ERROR',
        message: reply.error?.message ?? 'payment.list failed',
      });
    }
    return reply.data ?? [];
  }
}
