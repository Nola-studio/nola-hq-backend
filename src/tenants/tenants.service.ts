import {
  Injectable,
  Logger,
  NotFoundException,
  NotImplementedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NolaCommandsService } from '@nola-hq/nola-sdk';
import { TenantCrm } from './tenant-crm.entity';
import { TenantStatus } from './tenant.entity';
import { ListTenantsDto } from './dto/list-tenants.dto';
import { MomoEntry } from '../momo/momo-entry.entity';
import { Ticket } from '../tickets/ticket.entity';
import { ActivityEvent } from '../activity/activity.entity';
import { Invoice } from '../invoices/invoice.entity';
import type { PaginatedResult } from '../common/dto/pagination.dto';

/**
 * Canonical tenant fields owned by nola-billing, fetched via NATS admin
 * commands (`nola.commands.billing.admin.tenant.*`).
 */
interface BillingTenant {
  id: string;
  externalId: string;
  name: string;
  email: string;
  phone?: string | null;
  realm: string;
  lifecycleState:
    | 'active'
    | 'grace_period'
    | 'suspended'
    | 'blocked'
    | 'soft_deleted'
    | 'hard_deleted';
  metadata?: Record<string, unknown>;
  createdAt: string;
  subscriptions?: Array<{
    id: string;
    app: string;
    planId: string;
    status: string;
    plan?: { id: string; name: string; price?: string | number };
  }>;
}

/**
 * Read view returned by the HQ console. Merges canonical billing data
 * with the local CRM augmentation. Field names match what the existing
 * frontend already expects.
 */
export interface TenantView {
  id: string;
  name: string;
  country: string;
  city: string;
  apps: string[];
  plan: string;
  mrr_cdf: number;
  status: TenantStatus;
  since: string;
  users: number;
  owner: string;
  whatsapp: string;
  mobile_money: string;
  ar_days: number;
  nps: number | null;
}

const NOT_IMPLEMENTED_HINT =
  'nola-hq is read-only in CQRS mode — perform this operation via nola-billing (HTTP API or admin command).';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    @InjectRepository(TenantCrm) private readonly crm: Repository<TenantCrm>,
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    @InjectRepository(MomoEntry) private readonly momo: Repository<MomoEntry>,
    @InjectRepository(Ticket) private readonly tickets: Repository<Ticket>,
    @InjectRepository(ActivityEvent)
    private readonly activity: Repository<ActivityEvent>,
    private readonly commands: NolaCommandsService,
  ) {}

  // ─── Reads (merge nola-billing canonical + local CRM) ────────────

  async list(query: ListTenantsDto): Promise<PaginatedResult<TenantView>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const tenants = await this.fetchBillingTenants({
      app: query.app,
      state: query.status,
      search: query.q,
    });

    const crms = await this.crm.find();
    const crmByExternalId = new Map(crms.map((c) => [c.tenantId, c]));

    const views = tenants.map((t) =>
      this.merge(t, crmByExternalId.get(t.externalId)),
    );

    // Country filter applies post-merge (canonical doesn't store it).
    const filtered = query.country
      ? views.filter((v) => v.country === query.country)
      : views;

    // Plan filter applies post-merge (we derive plan from active sub).
    const planFiltered = query.plan
      ? filtered.filter((v) => v.plan === query.plan)
      : filtered;

    const sorted = sortViews(planFiltered, query.sort, (query as { order?: string }).order);

    const total = sorted.length;
    const start = (page - 1) * limit;
    const items = sorted.slice(start, start + limit);
    return { items, total, page, limit };
  }

  async findOne(id: string): Promise<TenantView> {
    const t = await this.findBillingTenantByExternalId(id);
    const crm = await this.crm.findOne({ where: { tenantId: id } });
    return this.merge(t, crm ?? null);
  }

  async detail(id: string) {
    const tenant = await this.findOne(id);
    const [invoices, payments, tickets, activity] = await Promise.all([
      // TODO Phase 2b: fetch invoices via nola.commands.billing.admin.invoice.list
      this.invoices.find({ where: { tenant: id }, order: { issued: 'DESC' }, take: 12 }),
      // TODO Phase 2b: fetch payments via nola.commands.billing.admin.payment.list
      this.momo.find({ where: { tenant: id }, order: { ts: 'DESC' }, take: 12 }),
      this.tickets.find({ where: { tenant: id }, order: { createdAt: 'DESC' }, take: 8 }),
      this.activity.find({ where: { ref: id }, order: { createdAt: 'DESC' }, take: 12 }),
    ]);
    return { tenant, invoices, payments, tickets, activity };
  }

  async recoveryList(): Promise<TenantView[]> {
    const { items } = await this.list({ page: 1, limit: 500 } as ListTenantsDto);
    return items
      .filter(
        (v) =>
          v.ar_days > 0 ||
          ['attention', 'churn-risk', 'suspended'].includes(v.status),
      )
      .sort((a, b) => b.ar_days - a.ar_days);
  }

  // ─── Writes — disabled in CQRS mode ──────────────────────────────
  // Signatures preserved so the existing controller still type-checks.
  // Body always throws — the right place for these ops is nola-billing.

  async create(_dto: unknown): Promise<never> {
    throw new NotImplementedException(NOT_IMPLEMENTED_HINT);
  }
  async update(_id: string, _dto: unknown): Promise<never> {
    throw new NotImplementedException(NOT_IMPLEMENTED_HINT);
  }
  async remove(_id: string): Promise<never> {
    throw new NotImplementedException(NOT_IMPLEMENTED_HINT);
  }
  async changePlan(_id: string, _plan: string): Promise<never> {
    throw new NotImplementedException(NOT_IMPLEMENTED_HINT);
  }
  async suspend(_id: string): Promise<never> {
    throw new NotImplementedException(NOT_IMPLEMENTED_HINT);
  }
  async resume(_id: string): Promise<never> {
    throw new NotImplementedException(NOT_IMPLEMENTED_HINT);
  }
  async setStatus(_id: string, _status: unknown): Promise<never> {
    throw new NotImplementedException(NOT_IMPLEMENTED_HINT);
  }

  // Reminders stay local (just appends to the activity log).
  async sendReminder(id: string, channel: string) {
    const t = await this.findOne(id);
    await this.recordActivity(
      'finance',
      'tenant.reminder_sent',
      id,
      `via ${channel} (J+${t.ar_days})`,
    );
    return { ok: true, tenant: t.id, channel, sentAt: new Date().toISOString() };
  }

  // ─── NATS calls + merge ──────────────────────────────────────────

  private async fetchBillingTenants(filters: {
    app?: string;
    state?: string;
    search?: string;
  }): Promise<BillingTenant[]> {
    const reply = await this.commands
      .send<typeof filters, BillingTenant[]>(
        'nola.commands.billing.admin.tenant.list',
        filters,
        { issuedBy: 'nola-hq', timeoutMs: 5_000 },
      )
      .catch((err: Error) => {
        this.logger.error(
          `tenant.list NATS call failed: ${err.message} — returning empty list`,
        );
        throw new ServiceUnavailableException({
          code: 'BILLING_UNAVAILABLE',
          message: 'nola-billing is unreachable',
        });
      });

    if (!reply.success) {
      this.logger.warn(
        `tenant.list returned error: ${reply.error?.code} ${reply.error?.message}`,
      );
      throw new ServiceUnavailableException({
        code: reply.error?.code ?? 'BILLING_ERROR',
        message: reply.error?.message ?? 'tenant.list failed',
      });
    }
    return reply.data ?? [];
  }

  private async findBillingTenantByExternalId(
    externalId: string,
  ): Promise<BillingTenant> {
    // No dedicated admin.tenant.get yet — list with no filter and search by id.
    // Phase 2b will add a `.get` handler to nola-billing if this becomes a hot path.
    const all = await this.fetchBillingTenants({});
    const t = all.find((x) => x.externalId === externalId || x.id === externalId);
    if (!t) throw new NotFoundException(`Tenant "${externalId}" not found in nola-billing`);
    return t;
  }

  private merge(t: BillingTenant, crm: TenantCrm | null | undefined): TenantView {
    const activeSub = (t.subscriptions ?? []).find((s) => s.status === 'active');
    const apps = Array.from(new Set((t.subscriptions ?? []).map((s) => s.app)));
    const plan = activeSub?.plan?.name ?? activeSub?.planId ?? 'free';
    const mrr = activeSub?.plan?.price ? Number(activeSub.plan.price) : 0;

    return {
      id: t.externalId,
      name: t.name,
      country: crm?.country ?? '',
      city: crm?.city ?? '',
      apps,
      plan,
      mrr_cdf: mrr,
      status: mapLifecycleToStatus(t.lifecycleState),
      since: t.createdAt?.slice(0, 10) ?? '',
      users: 0, // TODO Phase 2b: count realm users via nola-auth /users command
      owner: crm?.owner ?? '',
      whatsapp: crm?.whatsapp ?? '',
      mobile_money: crm?.mobileMoney ?? '',
      ar_days: 0, // TODO Phase 2b: compute from outstanding invoices
      nps: crm?.nps ?? null,
    };
  }

  private async recordActivity(
    cat: 'commercial' | 'finance' | 'tech' | 'incident' | 'support',
    action: string,
    ref: string,
    text: string,
  ) {
    await this.activity.save(
      this.activity.create({
        t: 'à l’instant',
        createdAt: new Date(),
        actor: 'sys',
        cat,
        text: `${action}: ${text}`,
        ref,
      }),
    );
  }
}

function mapLifecycleToStatus(
  state: BillingTenant['lifecycleState'],
): TenantStatus {
  switch (state) {
    case 'active':
      return 'healthy';
    case 'grace_period':
      return 'attention';
    case 'suspended':
    case 'blocked':
    case 'soft_deleted':
    case 'hard_deleted':
      return 'suspended';
    default:
      return 'healthy';
  }
}

function sortViews(
  views: TenantView[],
  field: string | undefined,
  order: string | undefined,
): TenantView[] {
  const dir = (order ?? 'desc').toLowerCase() === 'asc' ? 1 : -1;
  const f = (field ?? 'mrr_cdf') as keyof TenantView;
  return [...views].sort((a, b) => {
    const va = a[f] ?? 0;
    const vb = b[f] ?? 0;
    if (typeof va === 'number' && typeof vb === 'number') {
      return (va - vb) * dir;
    }
    return String(va).localeCompare(String(vb)) * dir;
  });
}
