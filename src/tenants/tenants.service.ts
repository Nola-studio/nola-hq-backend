import {
  BadRequestException,
  ConflictException,
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
import type { TenantStatus } from './tenant.entity';
import { ListTenantsDto } from './dto/list-tenants.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { KelasiProvisionClient } from './kelasi-provision.client';
import { MomoEntry } from '../momo/momo-entry.entity';
import { TicketsService } from '../tickets/tickets.service';
import { ActivityEvent } from '../activity/activity.entity';
import { Invoice } from '../invoices/invoice.entity';
import {
  SubscriptionsService,
  type BillingSubscriptionRow,
} from '../subscriptions/subscriptions.service';
import { PROVISIONABLE_PRODUCT_CODES } from '../company/company.constants';
import { PlansService } from '../plans/plans.service';
import { IamClientService } from '../iam/iam-client.service';
import type { IamMembershipResponse } from '../iam/iam.types';
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
  /**
   * Real member count for this tenant's org, via nola-iam. `null` = unknown
   * (the IAM fetch failed) — distinct from `0` (known to have no members).
   * Never report unknown as 0, same convention as `ar_days`.
   */
  users: number | null;
  owner: string;
  whatsapp: string;
  mobile_money: string;
  /**
   * Days an invoice has been outstanding. `null` = unknown (the billing AR
   * fetch failed) — distinct from `0` (known to be paid up). Never report
   * unknown as 0, or overdue tenants would look healthy.
   */
  ar_days: number | null;
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
    @InjectRepository(ActivityEvent)
    private readonly activity: Repository<ActivityEvent>,
    private readonly commands: NolaCommandsService,
    private readonly kelasiProvision: KelasiProvisionClient,
    private readonly subscriptions: SubscriptionsService,
    private readonly plans: PlansService,
    private readonly iam: IamClientService,
    private readonly ticketsService: TicketsService,
  ) {}

  // ─── Reads (merge nola-billing canonical + local CRM) ────────────

  async list(query: ListTenantsDto): Promise<PaginatedResult<TenantView>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    // Fan-out in parallel: canonical tenants from billing + local CRM
    // augmentation + outstanding invoices (drives the real ar_days value).
    // The invoice fetch is best-effort, but its failure must NOT be silently
    // reported as ar_days=0 (that makes overdue tenants look paid up) — on
    // failure we surface `null` (unknown) instead.
    const [tenants, crms, arDaysByTenant] = await Promise.all([
      this.fetchBillingTenants({
        app: query.app,
        state: query.status,
        search: query.q,
      }),
      this.crm.find(),
      this.fetchOutstandingArDays().catch((err) => {
        this.logger.warn(
          `Failed to fetch outstanding invoices for AR days — reporting ar_days as unknown: ${err.message}`,
        );
        return null;
      }),
    ]);

    const crmByExternalId = new Map(crms.map((c) => [c.tenantId, c]));

    const views = tenants.map((t) => {
      const view = this.merge(t, crmByExternalId.get(t.externalId));
      // Fetch succeeded → real value or 0 (paid up). Fetch failed → null
      // (unknown), never a misleading 0.
      view.ar_days =
        arDaysByTenant === null ? null : arDaysByTenant.get(t.externalId) ?? 0;
      return view;
    });

    // Resolve real user counts before sort/pagination — `sort=users` must
    // order by the real value, not the placeholder 0 `merge()` returns.
    await Promise.all(
      views.map(async (v) => {
        v.users = await this.countUsersForOrg(v.organizationId);
      }),
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
    const view = this.merge(t, crm ?? null);
    const [arDaysByTenant, users] = await Promise.all([
      this.fetchOutstandingArDays().catch((err) => {
        this.logger.warn(
          `Failed to fetch outstanding invoices for AR days — reporting ar_days as unknown: ${err.message}`,
        );
        return null;
      }),
      this.countUsersForOrg(view.organizationId),
    ]);
    view.ar_days =
      arDaysByTenant === null ? null : arDaysByTenant.get(t.externalId) ?? 0;
    view.users = users;
    return view;
  }

  async detail(id: string) {
    const tenant = await this.findOne(id);
    const [invoices, payments, ticketsPage, activity] = await Promise.all([
      // TODO Phase 2b: fetch invoices via nola.commands.billing.admin.invoice.list
      this.invoices.find({ where: { tenant: id }, order: { issued: 'DESC' }, take: 12 }),
      // TODO Phase 2b: fetch payments via nola.commands.billing.admin.payment.list
      this.momo.find({ where: { tenant: id }, order: { ts: 'DESC' }, take: 12 }),
      this.ticketsService.list({ tenant: id, limit: 8, page: 1 }),
      this.activity.find({ where: { ref: id }, order: { createdAt: 'DESC' }, take: 12 }),
    ]);
    return { tenant, invoices, payments, tickets: ticketsPage.items, activity };
  }

  async recoveryList(): Promise<TenantView[]> {
    const { items } = await this.list({ page: 1, limit: 500 } as ListTenantsDto);
    return items
      .filter(
        (v) =>
          (v.ar_days ?? 0) > 0 ||
          ['attention', 'churn-risk', 'suspended'].includes(v.status),
      )
      .sort((a, b) => (b.ar_days ?? 0) - (a.ar_days ?? 0));
  }

  /**
   * Resolve a tenant's IAM memberships from a `tenantId` (the stable
   * Keycloak/business identifier the HQ console holds), mapping
   * tenant → organizationId → nola-iam memberships.
   *
   * The Users tab on TenantDetail calls this so it can render every
   * member's name / email / platform role without the operator having to
   * resolve the org id by hand. Returns the membership rows (with the
   * eager-loaded person) exactly as `GET /iam/orgs/:id/memberships` would.
   *
   * A tenant with no `organizationId` (legacy / pre-Pattern-D) surfaces a
   * 409 with a machine-readable code so the UI can show "this tenant is
   * not yet linked to an organization" rather than an empty list that
   * looks like "no users".
   */
  async memberships(
    id: string,
    options: { includeInactive?: boolean } = {},
  ): Promise<{
    tenantId: string;
    organizationId: string;
    memberships: IamMembershipResponse[];
  }> {
    const tenant = await this.findOne(id);
    if (!tenant.organizationId) {
      throw new ConflictException({
        code: 'tenant_not_linked_to_org',
        message:
          'This tenant has no organizationId in nola-billing yet — memberships cannot be resolved until the org link is backfilled.',
        tenantId: id,
      });
    }
    const memberships = await this.iam.listMembershipsForOrg(
      tenant.organizationId,
      { includeInactive: options.includeInactive ?? false, includePerson: true },
    );
    return {
      tenantId: id,
      organizationId: tenant.organizationId,
      memberships,
    };
  }

  // ─── Writes ──────────────────────────────────────────────────────

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

    // V1 : seule l'app scolaire expose le point d'entrée hq-provision. Ajouter
    // une table de routage quand d'autres apps clientes offriront la même surface.
    const targetApp = (dto.apps?.[0] ?? '').trim();
    if (!PROVISIONABLE_PRODUCT_CODES.has(targetApp)) {
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

  /**
   * Change the active plan on a tenant by delegating to the canonical
   * billing flow (`SubscriptionsService.changePlan` →
   * `nola.commands.billing.admin.subscription.change_plan`).
   *
   * Retro-compat wrapper for the legacy `POST /tenants/:id/change-plan`
   * route. The richer surface is `POST /subscriptions/:tenantId/:app/change-plan`
   * which lets the operator target a specific app. Here we resolve the
   * tenant's app: if it has exactly one subscription we use it; if it has
   * several, `app` must be passed explicitly (400) so we never change the
   * wrong product silently.
   *
   * `plan` is forwarded as `newPlanId` — billing accepts either the plan
   * UUID or its name (e.g. `kelasi:growth`).
   */
  async changePlan(id: string, plan: string, app?: string) {
    const tenant = await this.findOne(id);
    const apps = tenant.apps;
    let targetApp = app?.trim();
    if (!targetApp) {
      if (apps.length === 1) {
        targetApp = apps[0];
      } else if (apps.length === 0) {
        throw new BadRequestException({
          code: 'no_subscription',
          message: `Tenant "${id}" has no active subscription to change.`,
        });
      } else {
        throw new BadRequestException({
          code: 'app_required',
          message: `Tenant "${id}" has multiple apps (${apps.join(', ')}). Pass "app" to choose which one to re-plan, or use POST /subscriptions/:tenantId/:app/change-plan.`,
          apps,
        });
      }
    }
    return this.subscriptions.changePlan({
      tenantId: id,
      app: targetApp,
      newPlanId: plan,
    });
  }

  /**
   * Provision (activate) an app on an existing tenant.
   *
   * Idempotent: if the app already has an active subscription we return
   * the current subscription row untouched (status=`already_active`) — no
   * double-provisioning.
   *
   * Otherwise we resolve the target plan and delegate to nola-billing's
   * `nola.commands.billing.admin.subscription.create` (idempotent by
   * tenant+app on the billing side too) to create a fresh Subscription row,
   * returning status=`activated`.
   *
   * Plan resolution:
   *   - `plan` provided  → forwarded as-is (UUID or name, e.g. "kelasi:free";
   *     billing resolves both).
   *   - `plan` omitted   → the app's default plan = the cheapest ACTIVE plan
   *     for that app, taken from the canonical billing catalogue
   *     (`PlansService.listAll({ app })`, which billing returns ordered by
   *     `price: 'asc'`). If the app has no active plan we surface a precise
   *     400 (`no_plan_for_app`) — never a guess, never a 501.
   *
   * Note: this only creates the billing Subscription. It does NOT spin up a
   * Keycloak user / Org / School (that's the brand-new-tenant path in
   * `create()` via kelasi-gateway hq-provision). "Activate app on existing
   * tenant" is purely a billing-subscription operation.
   */
  async activateApp(
    id: string,
    app: string,
    plan?: string,
  ): Promise<{
    tenantId: string;
    app: string;
    status: 'already_active' | 'activated';
    subscription: BillingSubscriptionRow;
  }> {
    const targetApp = app.trim();
    if (!targetApp) {
      throw new BadRequestException({
        code: 'app_required',
        message: 'app is required',
      });
    }
    // Confirm the tenant exists (404 otherwise) before touching billing.
    await this.findOne(id);

    // Idempotence: is the app already active for this tenant?
    const existing = await this.subscriptions.list({ tenantId: id, app: targetApp });
    const active = existing.find((s) => s.status === 'active') ?? existing[0];
    if (active) {
      await this.recordActivity(
        'commercial',
        'tenant.app_activation_noop',
        id,
        `${targetApp} already subscribed (status=${active.status})`,
      );
      return {
        tenantId: id,
        app: targetApp,
        status: 'already_active',
        subscription: active,
      };
    }

    // Resolve the plan to start the subscription on.
    const planId = await this.resolvePlanForApp(targetApp, plan);

    // Create the subscription on the billing side (idempotent there too).
    const subscription = await this.subscriptions.createSubscription({
      tenantId: id,
      app: targetApp,
      planId,
    });

    await this.recordActivity(
      'commercial',
      'tenant.app_activated',
      id,
      `${targetApp} · plan=${subscription.plan?.name ?? subscription.planId ?? planId}`,
    );

    return {
      tenantId: id,
      app: targetApp,
      status: 'activated',
      subscription,
    };
  }

  /**
   * Resolve the plan id/name to provision an app on.
   *
   * If the caller passed an explicit `plan` we forward it untouched —
   * billing accepts both the plan UUID and its name (e.g. "kelasi:free")
   * and is the authority that validates it (PLAN_NOT_FOUND surfaces back
   * as a billing error if it's bogus).
   *
   * Otherwise we pick the app's default plan = the cheapest ACTIVE plan in
   * the canonical billing catalogue. `PlansService.listAll({ app })` hits
   * `nola.commands.billing.admin.plan.list`, which billing returns already
   * filtered on `isActive: true` and ordered `price: 'asc'`, so the first
   * row is the cheapest active plan. No active plan for the app → 400.
   */
  private async resolvePlanForApp(
    app: string,
    explicitPlan?: string,
  ): Promise<string> {
    const trimmed = explicitPlan?.trim();
    if (trimmed) return trimmed;

    const plans = await this.plans.listAll({ app });
    const cheapest = plans[0];
    if (!cheapest) {
      throw new BadRequestException({
        code: 'no_plan_for_app',
        message: `No active plan found for app "${app}". Pass an explicit plan or activate one in nola-billing first.`,
        app,
      });
    }
    return cheapest.id;
  }

  async update(_id: string, _dto: unknown): Promise<never> {
    throw new NotImplementedException(NOT_IMPLEMENTED_HINT);
  }
  async remove(_id: string): Promise<never> {
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
      `via ${channel} (J+${t.ar_days ?? '?'})`,
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

  /**
   * Real user count for a tenant, via nola-iam's org memberships (the same
   * source `.memberships()` uses). A tenant with no `organizationId` (legacy
   * / pre-Pattern-D) genuinely has no linked org to count members for, so it
   * reports 0. An unreachable IAM is a different case — its failure must NOT
   * be silently reported as users=0 (that makes a tenant look empty when the
   * real count is simply unknown) — on failure we surface `null` instead,
   * same convention as `ar_days`.
   */
  private async countUsersForOrg(organizationId: string | null): Promise<number | null> {
    if (!organizationId) return 0;
    try {
      const memberships = await this.iam.listMembershipsForOrg(organizationId, {
        includeInactive: false,
      });
      return memberships.length;
    } catch (err) {
      this.logger.warn(
        `Failed to count users for org=${organizationId} — reporting users as unknown: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
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
      users: 0, // overridden by caller via countUsersForOrg() once organizationId is known
      owner: crm?.owner ?? '',
      whatsapp: crm?.whatsapp ?? '',
      mobile_money: crm?.mobileMoney ?? '',
      ar_days: 0, // overridden by caller via fetchOutstandingArDays()
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
