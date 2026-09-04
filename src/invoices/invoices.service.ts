import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NolaCommandsService, NolaClientService } from '@nola-hq/nola-sdk';
import { Invoice, type InvoiceStatus } from './invoice.entity';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesDto } from './dto/list-invoices.dto';
import { PaymentSucceededEventPayload } from './dto/payment-succeeded.dto';
import { BusinessPdfService } from '../business/business-pdf.service';
import { BusinessInvoice } from '../business/business-invoice.entity';
import { Product } from '../company/product.entity';
import { nextBusinessNumber } from '../business/business-number-sequence';
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
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly commands: NolaCommandsService,
    private readonly nolaClient: NolaClientService,
    private readonly pdfService: BusinessPdfService,
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
    return this.repo.save(this.repo.create({ ...dto, id, currency: dto.currency || 'USD' }));
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

  /** Generates sequential invoice number using HQ's authoritative sequence. */
  async generateSequentialInvoiceNumber(now: Date | number = new Date()): Promise<string> {
    const date = typeof now === 'number' ? new Date(Date.UTC(now, 0, 1)) : now;
    return nextBusinessNumber(this.repo.manager, 'FAC', date);
  }

  private async nextInvoiceId(): Promise<string> {
    return this.generateSequentialInvoiceNumber();
  }

  /**
   * Processes a `payment.succeeded` event:
   * 1. Resolves Product -> BusinessUnit -> LegalEntity (strictly failing closed on miss).
   * 2. Generates sequential invoice number via HQ's `nextBusinessNumber('FAC')`.
   * 3. Renders official branded PDF via `BusinessPdfService`.
   * 4. Dispatches email notification via fire-and-forget `nola.commands.notify.send`.
   * 5. Persists the `Invoice` row in HQ with real payment rail and currency.
   */
  async processPaymentSucceeded(payload: PaymentSucceededEventPayload): Promise<{
    invoiceNumber: string;
    receiptNumber: string;
    brandName: string;
    legalEntityName: string;
    pdfBuffer: Buffer;
    notificationDispatched: boolean;
  }> {
    const rawAmount = typeof payload.amount === 'string' ? parseFloat(payload.amount) : payload.amount;
    const amount = Number.isFinite(rawAmount) ? rawAmount : 0;
    const currency = (payload.currency || 'USD').toUpperCase();
    const productCode = (payload.appId || payload.productCode || '').trim();
    const paymentMethod = payload.provider || payload.paymentMethod || payload.method || 'mobile_money';
    const tenantId = (payload.tenantId || '').trim();
    const now = payload.paidAt ? new Date(payload.paidAt) : new Date();

    if (!productCode) {
      this.logger.error(
        `CRITICAL: payment.succeeded rejected — missing product/app identifier (tenant=${tenantId})`,
      );
      throw new BadRequestException('Missing product/app identifier for payment.succeeded');
    }

    // 1. Resolve Product -> BusinessUnit -> LegalEntity
    let product = await this.products.findOne({
      where: { code: productCode },
      relations: ['businessUnit', 'businessUnit.legalEntity'],
    });

    if (!product) {
      // Check legacy/source aliases
      const allProducts = await this.products.find({
        relations: ['businessUnit', 'businessUnit.legalEntity'],
      });
      product =
        allProducts.find(
          (p) => Array.isArray(p.sourceAliases) && p.sourceAliases.includes(productCode),
        ) ?? null;
    }

    if (!product || !product.businessUnit) {
      this.logger.error(
        `CRITICAL: payment.succeeded rejected — unresolvable brand for app '${productCode}' (tenant=${tenantId}). Zero mock fabrication allowed.`,
      );
      throw new BadRequestException(
        `Unresolvable brand for product '${productCode}'. Document generation aborted.`,
      );
    }

    const businessUnit = product.businessUnit;
    const legalEntity = businessUnit.legalEntity;

    // 2. Sequential Document Numbering strictly from HQ authority
    const invoiceNumber = await nextBusinessNumber(this.repo.manager, 'FAC', now);
    const receiptNumber = await nextBusinessNumber(this.repo.manager, 'REC', now);

    // 3. Render Branded PDF via BusinessPdfService
    const invoiceEntity: BusinessInvoice = {
      id: payload.invoiceId || invoiceNumber,
      number: invoiceNumber,
      receiptNumber,
      businessUnitId: businessUnit.id,
      businessUnit,
      amountCdf: amount,
      paidAmountCdf: amount,
      taxRate: 0,
      taxCdf: 0,
      taxLabel: null,
      currency: currency as any,
      issuedOn: now.toISOString().slice(0, 10),
      dueOn: now.toISOString().slice(0, 10),
      paidAt: now,
      status: 'paid',
      description: payload.description || `Abonnement ${product.name} — ${tenantId}`,
      paymentMethod: (paymentMethod as any) || 'mobile_money',
      paymentReference: payload.reference || payload.paymentId || null,
      verificationToken: receiptNumber,
      client: {
        name: payload.customerName || tenantId,
        email: payload.customerEmail || null,
        phone: null,
      } as any,
    } as BusinessInvoice;

    const pdfBuffer = await this.pdfService.invoice(invoiceEntity);

    // 4. Dispatch Email Notification via standard nola.commands.notify.send (fire-and-forget)
    let notificationDispatched = false;
    const recipient = payload.customerEmail || (tenantId ? `admin@${tenantId}.nola.cd` : null);

    if (recipient && this.nolaClient.isReady()) {
      try {
        await this.nolaClient.getClient().publish('nola.commands.notify.send', {
          channel: 'email',
          to: recipient,
          template: '_inline',
          variables: {
            subject: `Facture ${invoiceNumber} — ${businessUnit.name}`,
            body: `Votre paiement de ${amount} ${currency} pour le service ${product.name} (${tenantId}) a bien été enregistré. Facture n° ${invoiceNumber}.`,
          },
          idempotencyKey: `billing-payment-${payload.paymentId || payload.invoiceId || invoiceNumber}`,
          realm: 'nola-hq',
          tenantId: tenantId || 'nola-studio',
        });
        notificationDispatched = true;
        this.logger.warn(`notify dispatched, delivery not confirmed — invoice=${invoiceNumber} to=${recipient}`);
      } catch (err: any) {
        this.logger.error(`Failed to publish notify.send for ${invoiceNumber}: ${err.message}`);
      }
    } else if (recipient) {
      this.logger.warn(`nola_client_offline — skipped notification for ${recipient}`);
    }

    // 5. Persist/Update Invoice row
    const id = payload.invoiceId || invoiceNumber;
    let local = await this.repo.findOne({ where: { id } });
    if (!local) {
      local = this.repo.create({
        id,
        tenant: tenantId,
        amt: Math.round(amount),
        currency,
        status: 'paid',
        method: paymentMethod,
        issued: now.toISOString().slice(0, 10),
        due: now.toISOString().slice(0, 10),
      });
    } else {
      local.status = 'paid';
      local.amt = Math.round(amount);
      local.currency = currency;
      local.method = paymentMethod;
    }
    await this.repo.save(local);

    return {
      invoiceNumber,
      receiptNumber,
      brandName: businessUnit.name,
      legalEntityName: legalEntity?.name ?? 'Nolaa Studio',
      pdfBuffer,
      notificationDispatched,
    };
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
  inv.currency = b.currency || 'USD';
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
