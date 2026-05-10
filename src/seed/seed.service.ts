import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';

import { Country } from '../countries/country.entity';
import { AppEntity } from '../apps/app.entity';
import { Plan } from '../plans/plan.entity';
import { FeatureMatrixRow } from '../plans/feature-matrix-row.entity';
import { TeamMember } from '../team/team-member.entity';
import { Tenant, TenantStatus } from '../tenants/tenant.entity';
import { ActivityEvent } from '../activity/activity.entity';
import { PipelineItem } from '../pipeline/pipeline-item.entity';
import { HealthEntry } from '../health/health-entry.entity';
import { Ticket } from '../tickets/ticket.entity';
import { Invoice } from '../invoices/invoice.entity';
import { MomoEntry } from '../momo/momo-entry.entity';
import { AppModuleEntity } from '../app-modules/app-module.entity';
import { Deploy } from '../deploys/deploy.entity';
import { AuditEntry } from '../audit/audit.entity';
import { LogEntry } from '../logs/log.entity';
import { Kpi } from '../analytics/kpi.entity';

import {
  ACTIVITY_SEED,
  APPS_SEED,
  AUDIT_SEED,
  COUNTRIES_SEED,
  DEPLOYS_SEED,
  FEATURE_MATRIX_SEED,
  HEALTH_SEED,
  INVOICES_SEED,
  LOGS_SEED,
  MODULES_SEED,
  MOMO_SEED,
  PIPELINE_SEED,
  PLANS_SEED,
  TEAM_SEED,
  TENANTS_SEED,
  TICKETS_SEED,
  gen,
} from './seed-data';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Country) private readonly countries: Repository<Country>,
    @InjectRepository(AppEntity) private readonly apps: Repository<AppEntity>,
    @InjectRepository(Plan) private readonly plans: Repository<Plan>,
    @InjectRepository(FeatureMatrixRow)
    private readonly matrix: Repository<FeatureMatrixRow>,
    @InjectRepository(TeamMember)
    private readonly team: Repository<TeamMember>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(ActivityEvent)
    private readonly activity: Repository<ActivityEvent>,
    @InjectRepository(PipelineItem)
    private readonly pipeline: Repository<PipelineItem>,
    @InjectRepository(HealthEntry)
    private readonly health: Repository<HealthEntry>,
    @InjectRepository(Ticket) private readonly tickets: Repository<Ticket>,
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    @InjectRepository(MomoEntry) private readonly momo: Repository<MomoEntry>,
    @InjectRepository(AppModuleEntity)
    private readonly modules: Repository<AppModuleEntity>,
    @InjectRepository(Deploy) private readonly deploys: Repository<Deploy>,
    @InjectRepository(AuditEntry) private readonly audit: Repository<AuditEntry>,
    @InjectRepository(LogEntry) private readonly logs: Repository<LogEntry>,
    @InjectRepository(Kpi) private readonly kpis: Repository<Kpi>,
  ) {}

  async onApplicationBootstrap() {
    await this.run();
  }

  async run() {
    if ((await this.countries.count()) > 0) {
      this.logger.log('Seed déjà présent — aucune action.');
      return;
    }
    this.logger.log('Insertion des données initiales (seed)…');

    await this.seedCountries();
    await this.seedApps();
    await this.seedPlans();
    await this.seedFeatureMatrix();
    await this.seedTeam();
    await this.seedTenants();
    await this.seedModules();
    await this.seedActivity();
    await this.seedPipeline();
    await this.seedHealth();
    await this.seedTickets();
    await this.seedInvoices();
    await this.seedMomo();
    await this.seedDeploys();
    await this.seedAudit();
    await this.seedLogs();
    await this.seedKpis();

    this.logger.log('Seed terminé.');
  }

  private async seedCountries() {
    await this.countries.save(
      COUNTRIES_SEED.map((c) => this.countries.create(c)),
    );
  }

  private async seedApps() {
    await this.apps.save(
      APPS_SEED.map((a) =>
        this.apps.create({
          ...a,
          status: a.status as AppEntity['status'],
        }),
      ),
    );
  }

  private async seedPlans() {
    await this.plans.save(PLANS_SEED.map((p) => this.plans.create(p)));
  }

  private async seedFeatureMatrix() {
    await this.matrix.save(
      FEATURE_MATRIX_SEED.map((row) => this.matrix.create(row)),
    );
  }

  private async seedTeam() {
    const rows: TeamMember[] = [];
    for (const m of TEAM_SEED) {
      const passwordHash = await bcrypt.hash(m.password, 8);
      rows.push(
        this.team.create({
          id: m.id,
          name: m.name,
          role: m.role,
          tag: m.tag,
          avatar: m.avatar,
          hue: m.hue,
          online: m.online,
          email: m.email,
          country: m.country,
          perms: m.perms,
          last: m.last,
          passwordHash,
        }),
      );
    }
    await this.team.save(rows);
  }

  private async seedTenants() {
    await this.tenants.save(
      TENANTS_SEED.map((t) =>
        this.tenants.create({
          id: t.id,
          name: t.name,
          country: t.country,
          city: t.city,
          apps: t.apps,
          plan: t.plan,
          mrrCdf: t.mrrCdf,
          status: t.status as TenantStatus,
          since: t.since,
          users: t.users,
          owner: t.owner,
          whatsapp: t.whatsapp,
          mobileMoney: t.mobileMoney,
          arDays: t.arDays,
          nps: t.nps,
        }),
      ),
    );
  }

  private async seedModules() {
    await this.modules.save(
      MODULES_SEED.map((m) =>
        this.modules.create({
          id: m.id,
          app: m.app,
          label: m.label,
          default: m.default,
          beta: m.beta,
        }),
      ),
    );
  }

  private async seedActivity() {
    const now = Date.now();
    await this.activity.save(
      ACTIVITY_SEED.map((e, i) =>
        this.activity.create({
          ...e,
          createdAt: new Date(now - i * 60_000),
        }),
      ),
    );
  }

  private async seedPipeline() {
    await this.pipeline.save(
      PIPELINE_SEED.map((p) => this.pipeline.create(p)),
    );
  }

  private async seedHealth() {
    await this.health.save(
      HEALTH_SEED.map((h) =>
        this.health.create({ ...h, series: gen(48, 60, 80, 0.25) }),
      ),
    );
  }

  private async seedTickets() {
    const now = new Date();
    await this.tickets.save(
      TICKETS_SEED.map((t, i) =>
        this.tickets.create({
          ...t,
          createdAt: new Date(now.getTime() - i * 60 * 60_000),
          updatedAt: new Date(now.getTime() - i * 30 * 60_000),
        }),
      ),
    );
  }

  private async seedInvoices() {
    await this.invoices.save(
      INVOICES_SEED.map((i) => this.invoices.create(i)),
    );
  }

  private async seedMomo() {
    await this.momo.save(MOMO_SEED.map((m) => this.momo.create(m)));
  }

  private async seedDeploys() {
    await this.deploys.save(DEPLOYS_SEED.map((d) => this.deploys.create(d)));
  }

  private async seedAudit() {
    const now = Date.now();
    await this.audit.save(
      AUDIT_SEED.map((a, i) =>
        this.audit.create({
          ...a,
          createdAt: new Date(now - i * 5 * 60_000),
        }),
      ),
    );
  }

  private async seedLogs() {
    const now = Date.now();
    await this.logs.save(
      LOGS_SEED.map((l, i) =>
        this.logs.create({
          ...l,
          createdAt: new Date(now - i * 1_000),
        }),
      ),
    );
  }

  private async seedKpis() {
    const tenants = await this.tenants.find();
    const totalMRR = tenants.reduce((s, t) => s + t.mrrCdf, 0);
    const activeTenants = tenants.filter((t) =>
      ['healthy', 'attention'].includes(t.status),
    ).length;

    const kpis = [
      { id: 'mrr',       label: 'MRR consolidé',  value: totalMRR,     unit: 'cdf',   delta:  12.4, series: gen(30,  95, 124, 0.03), invertColor: false },
      { id: 'arr',       label: 'ARR (annualisé)',value: totalMRR * 12, unit: 'cdf',  delta:  14.8, series: gen(30, 1100, 1490, 0.04), invertColor: false },
      { id: 'tenants',   label: 'Tenants actifs', value: activeTenants, unit: 'count', delta:   8.0, series: gen(30, 70, 92, 0.015), invertColor: false },
      { id: 'churn',     label: 'Churn 30j',      value: 1.7,           unit: 'pct',   delta:  -0.4, series: gen(30, 2.4, 1.7, 0.06), invertColor: true },
      { id: 'nps',       label: 'NPS écosystème', value: 56,            unit: 'count', delta:   3,    series: gen(30, 47, 58, 0.02), invertColor: false },
      { id: 'incidents', label: 'Incidents (7j)', value: 4,             unit: 'count', delta:  -2,    series: gen(7,  2, 4, 0.5), invertColor: true },
    ];
    await this.kpis.save(kpis.map((k) => this.kpis.create(k)));
  }
}
