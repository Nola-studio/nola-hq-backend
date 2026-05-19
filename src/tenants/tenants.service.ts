import {
  BadRequestException,
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
import { CreateTenantDto } from './dto/create-tenant.dto';
import { KelasiProvisionClient } from './kelasi-provision.client';
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
  /**
   * Pattern-D cross-DB pointer to nola_iam.organizations.id. Nullable on
   * legacy tenants (pre-rollout) — the HQ console treats `null` as
   * "unlinked" and exposes the gap so it can be backfilled.
   */
  organizationId?: string | null;
  /**
   * ISO-3166-1 alpha-2 country code denormalized from the org. Drives the
   * tenant page's flag display + country filter without a cross-service
   * join on every render.
   */
  countryCode?: string | null;
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
  /**
   * Pattern-D pointer into nola-iam.organizations. Surfaced so the HQ
   * console can navigate to the org detail (memberships, audit trail)
   * without resolving it through a side channel.
   */
  organizationId: string | null;
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
    private readonly kelasiProvision: KelasiProvisionClient,
  ) {}

  // ─── Reads (merge nola-billing canonical + local CRM) ────────────

  async list(query: ListTenantsDto): Promise<PaginatedResult<TenantView>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    // Fan-out in parallel: canonical tenants from billing + local CRM
    // augmentation + outstanding invoices (drives the real ar_days
    // value). The invoice fetch is best-effort — if billing is down
    // for that call we still return tenant rows with ar_days=0.
    const [tenants, crms, arDaysByTenant] = await Promise.all([
      this.fetchBillingTenants({
        app: query.app,
        state: query.status,
        search: query.q,
      }),
      this.crm.find(),
      this.fetchOutstandingArDays().catch((err) => {
        this.logger.warn(
          `Failed to fetch outstanding invoices for AR days: ${err.message}`,
        );
        return new Map<string, number>();
      }),
    ]);

    const crmByExternalId = new Map(crms.map((c) => [c.tenantId, c]));

    const views = tenants.map((t) => {
      const view = this.merge(t, crmByExternalId.get(t.externalId));
      // Override the merge() default (0) with the computed value.
      view.ar_days = arDaysByTenant.get(t.externalId) ?? 0;
      return view;
    });

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

  /**
   * Onboard a new tenant from the HQ console.
   *
   * Two-step pipeline:
   *   1. Call kelasi-gateway's `POST /api/admin/hq-provision` —
   *      orchestrates Keycloak (no password) + IAM (Person/Org/Membership)
   *      + nola-billing (Subscription) + svc-admin (School) + Kriver
   *      (merchant) + the "Set your password" email through Resend.
   *
   *   2. Persist the local CRM augmentation row (city / WhatsApp /
   *      mobile-money / provisioning state). The billing row is the
   *      canonical source for the rest (name, plan, lifecycleState…);
   *      we merge them at read time in `list()`.
   *
   * Failures on (1) bubble up to the operator UI as 409 (email taken)
   * / 400 (validation) / 503 (kelasi unreachable). We don't write the
   * CRM row on failure — the tenant doesn't really exist yet, and a
   * retry from the wizard re-attempts the full chain cleanly.
   */
  async create(dto: CreateTenantDto): Promise<TenantView> {
    if (!dto.ownerEmail || !dto.ownerFirstName || !dto.ownerLastName) {
      throw new BadRequestException(
        'owner_required: ownerEmail, ownerFirstName, ownerLastName must be set',
      );
    }
    const planSlug = dto.plan as 'free' | 'starter' | 'growth' | 'scale';
    if (!['free', 'starter', 'growth', 'scale'].includes(planSlug)) {
      throw new BadRequestException(`unsupported_plan: ${dto.plan}`);
    }
    if (planSlug !== 'free' && !dto.mobileMoneyPhone) {
      throw new BadRequestException('mobile_money_phone_required_for_paid_plans');
    }

    const targetApp = (dto.apps?.[0] ?? '').trim();
    if (targetApp !== 'kelasi') {
      // V1: only kelasi has the hq-provision endpoint. Add a routing
      // table later when other customer apps gain the same surface.
      throw new BadRequestException(`unsupported_app: ${targetApp || '(none)'}`);
    }

    const result = await this.kelasiProvision.provision({
      schoolName: dto.name.trim(),
      countryCode: dto.country.toUpperCase(),
      city: dto.city?.trim() || undefined,
      address: dto.address?.trim() || undefined,
      planSlug,
      // Forward the optional academic bootstrap. When present,
      // kelasi-gateway runs school/setup so the owner lands on a
      // ready admin shell (year + classes + subjects + fees) without
      // having to run the OnboardingWizard themselves.
      academic:
        dto.academic && dto.academic.yearLabel && dto.academic.yearStartDate && dto.academic.yearEndDate
          ? {
              yearLabel: dto.academic.yearLabel,
              yearStartDate: dto.academic.yearStartDate,
              yearEndDate: dto.academic.yearEndDate,
              levelCodes: dto.academic.levelCodes ?? [],
              campusName: dto.academic.campusName,
              sectionsPerLevel: dto.academic.sectionsPerLevel,
            }
          : undefined,
      owner: {
        firstName: dto.ownerFirstName.trim(),
        lastName: dto.ownerLastName.trim(),
        email: dto.ownerEmail.trim().toLowerCase(),
        whatsappPhone: dto.whatsapp?.trim() || undefined,
        mobileMoneyPhone: dto.mobileMoneyPhone?.trim() || undefined,
      },
    });

    // Persist CRM augmentation. We use the kelasi tenantId as the key —
    // billing's externalId mirrors it once the subscription lands, so
    // the `list()` merge picks this row up on the next refresh.
    await this.crm.save(
      this.crm.create({
        tenantId: result.tenantId,
        country: dto.country.toUpperCase(),
        city: dto.city ?? null,
        owner: `${dto.ownerFirstName.trim()} ${dto.ownerLastName.trim()}`.trim(),
        whatsapp: dto.whatsapp ?? '',
        mobileMoney: dto.mobile_money ?? '',
        nps: null,
        kcUserId: result.kcUserId,
        kelasiSchoolId: result.schoolId,
        ownerEmail: dto.ownerEmail.trim().toLowerCase(),
        mobileMoneyPhone: dto.mobileMoneyPhone ?? null,
        provisionedAt: result.invitationSentAt,
        provisionError: null,
      }),
    );

    await this.recordActivity(
      'commercial',
      'tenant.provisioned',
      result.tenantId,
      `${dto.name} · ${planSlug} · ${dto.country} · owner=${dto.ownerEmail}`,
    );

    // Synthetic view; the next `list()` will merge with the live billing
    // tenant once nola-billing has caught up with the subscription.
    return {
      id: result.tenantId,
      name: dto.name,
      country: dto.country.toUpperCase(),
      city: dto.city ?? '',
      apps: [targetApp],
      plan: planSlug,
      mrr_cdf: dto.mrr_cdf ?? 0,
      status: result.schoolStatus === 'pending_payment' ? 'onboarding' : 'trial',
      since: new Date().toISOString().slice(0, 10),
      users: 0,
      owner: `${dto.ownerFirstName} ${dto.ownerLastName}`.trim(),
      whatsapp: dto.whatsapp,
      mobile_money: dto.mobile_money,
      ar_days: 0,
      nps: null,
      organizationId: result.organizationId ?? null,
    };
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

  /**
   * Query nola-billing for every unpaid invoice on the platform, then
   * group by tenantId and compute the worst (largest) ar_days — the
   * value the recovery queue sorts on. One NATS round-trip serves the
   * entire tenant list, so it's cheap to call on every `list()`.
   *
   * Statuses considered "unpaid" : `pending`, `late`, `overdue`. Returns
   * an empty map if billing is unreachable (caller-handled).
   */
  private async fetchOutstandingArDays(): Promise<Map<string, number>> {
    const reply = await this.commands.send<
      { limit: number },
      Array<{ tenantId: string; status: string; dueDate?: string }>
    >(
      'nola.commands.billing.admin.invoice.list',
      { limit: 1000 },
      { issuedBy: 'nola-hq', timeoutMs: 5_000 },
    );
    if (!reply.success || !Array.isArray(reply.data)) return new Map();
    const today = Date.now();
    const arByTenant = new Map<string, number>();
    for (const inv of reply.data) {
      if (!inv.tenantId || !inv.dueDate) continue;
      if (!['pending', 'late', 'overdue'].includes(inv.status)) continue;
      const due = Date.parse(inv.dueDate);
      if (Number.isNaN(due) || due >= today) continue;
      const days = Math.floor((today - due) / 86_400_000);
      const prev = arByTenant.get(inv.tenantId) ?? 0;
      if (days > prev) arByTenant.set(inv.tenantId, days);
    }
    return arByTenant;
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

    // Country precedence: billing canonical (set at signup via tenant.upsert)
    // wins over the local CRM augmentation. CRM is the legacy fallback for
    // tenants created before Pattern D landed the column in billing.
    const country = (t.countryCode ?? crm?.country ?? '').toUpperCase();
    return {
      id: t.externalId,
      name: t.name,
      country,
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
      organizationId: t.organizationId ?? null,
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
