import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NolaCommandsService } from '@nola-hq/nola-sdk';
import { Invoice, type InvoiceStatus } from './invoice.entity';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesDto } from './dto/list-invoices.dto';
import type { PaginatedResult } from '../common/dto/pagination.dto';

/**
 * Raw shape emitted by nola-billing's admin `invoice.list` command — mirrors
 * the Prisma Invoice model with optional `subscription` enrichment.
 */
interface BillingInvoice {
  id: string;
  subscriptionId: string;
  tenantId: string;
  realm: string;
  billingPeriod: string;
  amount: string;
  currency: string;
  status: string;
  dueDate: string;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
  subscription?: {
    app: string;
    planId: string;
    plan?: { name: string };
  };
}

/**
 * InvoicesService — read path goes through nola-billing via NATS admin
 * commands (`nola.commands.billing.admin.invoice.list`). The local repo
 * is kept for HQ-only manual entries that don't have a counterpart in
 * billing (e.g. operator-recorded adjustments) — those rows still flow
 * through `create()` / `setStatus()` but list/summary now fan-out to
 * billing first.
 */
@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    @InjectRepository(Invoice) private readonly repo: Repository<Invoice>,
    private readonly commands: NolaCommandsService,
  ) {}

  async list(query: ListInvoicesDto): Promise<PaginatedResult<Invoice>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const all = await this.fetchBillingInvoices({
      tenantId: query.tenant,
      status: query.status,
      limit: 500,
    });
    // Method filter applies post-fetch (billing doesn't track it).
    const filtered = query.method
      ? all.filter((i) => methodFromInvoice(i) === query.method)
      : all;
    const sorted = [...filtered].sort((a, b) =>
      (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
    );
    const total = sorted.length;
    const slice = sorted.slice((page - 1) * limit, page * limit);
    return {
      items: slice.map(adaptBillingInvoice),
      total,
      page,
      limit,
    };
  }

  async findOne(id: string): Promise<Invoice> {
    // Try billing first; fall back to local repo for HQ-only rows.
    const all = await this.fetchBillingInvoices({ limit: 500 });
    const found = all.find((i) => i.id === id);
    if (found) return adaptBillingInvoice(found);
    const local = await this.repo.findOne({ where: { id } });
    if (!local) throw new NotFoundException(`Facture ${id} introuvable`);
    return local;
  }

  async create(dto: CreateInvoiceDto) {
    const id = dto.id ?? (await this.nextInvoiceId());
    if (await this.repo.findOne({ where: { id } })) {
      throw new BadRequestException(`Facture ${id} existe déjà`);
    }
    return this.repo.save(this.repo.create({ ...dto, id }));
  }

  async setStatus(id: string, status: InvoiceStatus, method?: string) {
    const local = await this.repo.findOne({ where: { id } });
    if (!local) {
      // Billing-owned invoices are read-only from HQ; a future admin action
      // would publish `nola.commands.billing.admin.invoice.mark_paid` etc.
      throw new BadRequestException(
        `Facture ${id} provient de nola-billing — utiliser le flux admin billing pour la modifier.`,
      );
    }
    local.status = status;
    if (method) local.method = method;
    return this.repo.save(local);
  }

  async overdue(): Promise<Invoice[]> {
    const all = await this.fetchBillingInvoices({ status: 'overdue', limit: 500 });
    return all.map(adaptBillingInvoice).sort((a, b) => a.due.localeCompare(b.due));
  }

  async summary() {
    const all = await this.fetchBillingInvoices({ limit: 1_000 });
    const adapted = all.map(adaptBillingInvoice);
    const sum = (p: (i: Invoice) => boolean) =>
      adapted.filter(p).reduce((s, i) => s + i.amt, 0);
    return {
      total: adapted.length,
      paid_cdf: sum((i) => i.status === 'paid'),
      pending_cdf: sum((i) => i.status === 'pending'),
      late_cdf: sum((i) => i.status === 'late'),
      overdue_cdf: sum((i) => i.status === 'overdue'),
    };
  }

  private async nextInvoiceId() {
    const last = await this.repo
      .createQueryBuilder('i')
      .orderBy('i.id', 'DESC')
      .getOne();
    const year = new Date().getFullYear();
    if (!last) return `INV-${year}-0001`;
    const num = parseInt(last.id.split('-').pop() ?? '0', 10) || 0;
    return `INV-${year}-${String(num + 1).padStart(4, '0')}`;
  }

  private async fetchBillingInvoices(filter: {
    tenantId?: string;
    app?: string;
    status?: string;
    limit?: number;
  }): Promise<BillingInvoice[]> {
    const reply = await this.commands
      .send<typeof filter, BillingInvoice[]>(
        'nola.commands.billing.admin.invoice.list',
        filter,
        { issuedBy: 'nola-hq', timeoutMs: 5_000 },
      )
      .catch((err: Error) => {
        this.logger.warn(`invoice.list NATS call failed: ${err.message}`);
        throw new ServiceUnavailableException({
          code: 'BILLING_UNAVAILABLE',
          message: 'nola-billing is unreachable',
        });
      });
    if (!reply.success) {
      this.logger.warn(
        `invoice.list returned error: ${reply.error?.code} ${reply.error?.message}`,
      );
      throw new ServiceUnavailableException({
        code: reply.error?.code ?? 'BILLING_ERROR',
        message: reply.error?.message ?? 'invoice.list failed',
      });
    }
    return reply.data ?? [];
  }
}

/**
 * Bridge between nola-billing's canonical shape and the HQ entity that
 * the frontend already expects. The HQ status enum is a coarser projection
 * of billing's lifecycle — anything not paid/late/overdue lands on
 * `pending` rather than inventing new statuses on the UI side.
 */
function adaptBillingInvoice(b: BillingInvoice): Invoice {
  const status: InvoiceStatus =
    b.status === 'paid'
      ? 'paid'
      : b.status === 'overdue'
        ? 'overdue'
        : b.status === 'late'
          ? 'late'
          : 'pending';
  const inv = new Invoice();
  inv.id = b.id;
  inv.tenant = b.tenantId;
  inv.amt = Math.round(Number(b.amount ?? 0));
  inv.due = (b.dueDate ?? b.createdAt ?? '').slice(0, 10);
  inv.status = status;
  inv.method = methodFromInvoice(b);
  inv.issued = (b.createdAt ?? '').slice(0, 10);
  return inv;
}

/**
 * Billing's Payment row carries the provider (mpesa/airtel/kriver/…) but
 * isn't joined into the invoice listing. Until that's added on the listener
 * side, we surface the app id as a best-effort label so the UI doesn't show
 * "—" for everything.
 */
function methodFromInvoice(b: BillingInvoice): string {
  return b.subscription?.app ?? b.realm ?? 'billing';
}
