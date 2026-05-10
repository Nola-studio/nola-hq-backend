import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Tenant, TenantStatus } from './tenant.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { ListTenantsDto } from './dto/list-tenants.dto';
import { Invoice } from '../invoices/invoice.entity';
import { MomoEntry } from '../momo/momo-entry.entity';
import { Ticket } from '../tickets/ticket.entity';
import { ActivityEvent } from '../activity/activity.entity';
import type { PaginatedResult } from '../common/dto/pagination.dto';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant) private readonly repo: Repository<Tenant>,
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    @InjectRepository(MomoEntry) private readonly momo: Repository<MomoEntry>,
    @InjectRepository(Ticket) private readonly tickets: Repository<Ticket>,
    @InjectRepository(ActivityEvent)
    private readonly activity: Repository<ActivityEvent>,
  ) {}

  async list(query: ListTenantsDto): Promise<PaginatedResult<Tenant>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const qb = this.repo.createQueryBuilder('t');

    if (query.country) qb.andWhere('t.country = :country', { country: query.country });
    if (query.plan) qb.andWhere('t.plan = :plan', { plan: query.plan });
    if (query.status) qb.andWhere('t.status = :status', { status: query.status });
    if (query.app) {
      qb.andWhere(`t.apps LIKE :app`, { app: `%"${query.app}"%` });
    }
    if (query.q) {
      const q = `%${query.q.toLowerCase()}%`;
      qb.andWhere(
        new Brackets((b) => {
          b.where('LOWER(t.name) LIKE :q', { q })
            .orWhere('LOWER(t.city) LIKE :q', { q })
            .orWhere('LOWER(t.owner) LIKE :q', { q });
        }),
      );
    }

    const sortField = query.sort ?? 'mrr_cdf';
    const sortColumn = mapSortColumn(sortField);
    const order = (query.order ?? 'desc').toUpperCase() as 'ASC' | 'DESC';
    qb.orderBy(sortColumn, order);

    const total = await qb.getCount();
    const items = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { items, total, page, limit };
  }

  async findOne(id: string) {
    const t = await this.repo.findOne({ where: { id } });
    if (!t) throw new NotFoundException(`Tenant ${id} introuvable`);
    return t;
  }

  async detail(id: string) {
    const tenant = await this.findOne(id);
    const [invoices, payments, tickets, activity] = await Promise.all([
      this.invoices.find({
        where: { tenant: id },
        order: { issued: 'DESC' },
        take: 12,
      }),
      this.momo.find({ where: { tenant: id }, order: { ts: 'DESC' }, take: 12 }),
      this.tickets.find({
        where: { tenant: id },
        order: { createdAt: 'DESC' },
        take: 8,
      }),
      this.activity.find({
        where: { ref: id },
        order: { createdAt: 'DESC' },
        take: 12,
      }),
    ]);
    return { tenant, invoices, payments, tickets, activity };
  }

  async create(dto: CreateTenantDto) {
    const id = dto.id ?? (await this.nextTenantId());
    if (await this.repo.findOne({ where: { id } })) {
      throw new BadRequestException(`Tenant ${id} existe déjà`);
    }
    const tenant = this.repo.create({
      id,
      name: dto.name,
      country: dto.country,
      city: dto.city,
      apps: dto.apps,
      plan: dto.plan,
      mrrCdf: dto.mrr_cdf ?? 0,
      status: dto.status as TenantStatus,
      since: dto.since,
      users: dto.users ?? 0,
      owner: dto.owner,
      whatsapp: dto.whatsapp,
      mobileMoney: dto.mobile_money,
      arDays: dto.ar_days ?? 0,
      nps: dto.nps ?? null,
    });
    return this.repo.save(tenant);
  }

  async update(id: string, dto: UpdateTenantDto) {
    const t = await this.findOne(id);
    if (dto.mrr_cdf !== undefined) t.mrrCdf = dto.mrr_cdf;
    if (dto.mobile_money !== undefined) t.mobileMoney = dto.mobile_money;
    if (dto.ar_days !== undefined) t.arDays = dto.ar_days;
    if (dto.nps !== undefined) t.nps = dto.nps;
    if (dto.name !== undefined) t.name = dto.name;
    if (dto.country !== undefined) t.country = dto.country;
    if (dto.city !== undefined) t.city = dto.city;
    if (dto.apps !== undefined) t.apps = dto.apps;
    if (dto.plan !== undefined) t.plan = dto.plan;
    if (dto.status !== undefined) t.status = dto.status as TenantStatus;
    if (dto.since !== undefined) t.since = dto.since;
    if (dto.users !== undefined) t.users = dto.users;
    if (dto.owner !== undefined) t.owner = dto.owner;
    if (dto.whatsapp !== undefined) t.whatsapp = dto.whatsapp;
    return this.repo.save(t);
  }

  async remove(id: string) {
    const t = await this.findOne(id);
    await this.repo.remove(t);
    return { ok: true };
  }

  async changePlan(id: string, plan: string) {
    const t = await this.findOne(id);
    const previous = t.plan;
    t.plan = plan;
    if (t.status === 'trial' && plan !== 'free') t.status = 'onboarding';
    await this.repo.save(t);
    await this.recordActivity('commercial', `tenant.plan_changed`, id, `${previous} → ${plan}`);
    return t;
  }

  async suspend(id: string) {
    const t = await this.findOne(id);
    t.status = 'suspended';
    await this.repo.save(t);
    await this.recordActivity('commercial', 'tenant.suspended', id, `tenant=${id}`);
    return t;
  }

  async resume(id: string) {
    const t = await this.findOne(id);
    t.status = t.arDays > 0 ? 'attention' : 'healthy';
    await this.repo.save(t);
    await this.recordActivity('commercial', 'tenant.resumed', id, `tenant=${id}`);
    return t;
  }

  async setStatus(id: string, status: TenantStatus) {
    const t = await this.findOne(id);
    t.status = status;
    await this.repo.save(t);
    return t;
  }

  async recoveryList() {
    const list = await this.repo
      .createQueryBuilder('t')
      .where('t.ar_days > 0')
      .orWhere(`t.status IN ('attention','churn-risk','suspended')`)
      .orderBy('t.ar_days', 'DESC')
      .getMany();
    return list;
  }

  private async nextTenantId() {
    const last = await this.repo
      .createQueryBuilder('t')
      .orderBy('t.id', 'DESC')
      .getOne();
    if (!last) return 't-001';
    const num = parseInt(last.id.replace(/[^0-9]/g, ''), 10) || 0;
    return 't-' + String(num + 1).padStart(3, '0');
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

function mapSortColumn(field: string): string {
  switch (field) {
    case 'mrr_cdf':
      return 't.mrr_cdf';
    case 'ar_days':
      return 't.ar_days';
    case 'name':
      return 't.name';
    case 'country':
      return 't.country';
    case 'plan':
      return 't.plan';
    case 'users':
      return 't.users';
    case 'status':
      return 't.status';
    case 'since':
      return 't.since';
    case 'nps':
      return 't.nps';
    default:
      return 't.mrr_cdf';
  }
}
