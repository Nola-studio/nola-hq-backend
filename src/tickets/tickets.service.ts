import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket, TicketStatus } from './ticket.entity';
import {
  AddReplyDto,
  CreateTicketDto,
} from './dto/create-ticket.dto';
import { PaginationDto, type PaginatedResult } from '../common/dto/pagination.dto';
import { PushService } from '../push/push.service';
import { TicketsNotifyService } from './tickets-notify.service';
import { BusinessUnitResolverService, DEFAULT_BUSINESS_UNIT_CODE } from '../company/business-unit-resolver.service';

export interface TicketsListQuery extends PaginationDto {
  tenant?: string;
  status?: string;
  assignee?: string;
  priority?: string;
}

/** `Ticket` as the API returns it: `businessUnit` trimmed to `{code, name}` rather than the full joined row. */
export type TicketResponse = Omit<Ticket, 'businessUnit'> & {
  businessUnit: { code: string; name: string };
};

function toTicketResponse(t: Ticket): TicketResponse {
  return { ...t, businessUnit: { code: t.businessUnit!.code, name: t.businessUnit!.name } };
}

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectRepository(Ticket) private readonly repo: Repository<Ticket>,
    private readonly push: PushService,
    private readonly notify: TicketsNotifyService,
    private readonly businessUnits: BusinessUnitResolverService,
  ) {}

  async list(query: TicketsListQuery): Promise<PaginatedResult<TicketResponse>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const qb = this.repo.createQueryBuilder('t').leftJoinAndSelect('t.businessUnit', 'businessUnit');
    if (query.tenant) qb.andWhere('t.tenant = :tenant', { tenant: query.tenant });
    if (query.status) qb.andWhere('t.status = :status', { status: query.status });
    if (query.assignee)
      qb.andWhere('t.assignee = :assignee', { assignee: query.assignee });
    if (query.priority)
      qb.andWhere('t.priority = :priority', { priority: query.priority });
    if (query.q) {
      qb.andWhere('(LOWER(t.subject) LIKE :q OR LOWER(t.body) LIKE :q)', {
        q: `%${query.q.toLowerCase()}%`,
      });
    }
    qb.orderBy('t.createdAt', 'DESC');
    const total = await qb.getCount();
    const items = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    return { items: items.map(toTicketResponse), total, page, limit };
  }

  async findOne(id: number): Promise<TicketResponse> {
    const t = await this.repo.findOne({ where: { id }, relations: ['businessUnit'] });
    if (!t) throw new NotFoundException(`Ticket ${id} introuvable`);
    return toTicketResponse(t);
  }

  async create(dto: CreateTicketDto) {
    const now = new Date();
    if (!dto.businessUnitCode) {
      this.logger.debug(
        `create(): no businessUnitCode supplied, defaulting to '${DEFAULT_BUSINESS_UNIT_CODE}'`,
      );
    }
    const businessUnitId = await this.businessUnits.resolve(dto.businessUnitCode ?? DEFAULT_BUSINESS_UNIT_CODE);
    const ticket = this.repo.create({
      tenant: dto.tenant,
      subject: dto.subject,
      title: dto.title ?? dto.subject,
      body: dto.body,
      contact: dto.contact,
      priority: dto.priority,
      status: dto.status ?? 'open',
      assignee: dto.assignee,
      assigned: dto.assignee,
      sla: dto.sla ?? '24h',
      category: dto.category ?? null,
      source: dto.source ?? null,
      businessUnitId,
      age: '0 min',
      ago: '0 min',
      replies: [],
      createdAt: now,
      updatedAt: now,
    });
    const saved = await this.repo.save(ticket);
    // Fire-and-forget : une notif ratée ne doit jamais faire échouer la
    // création du ticket (broadcast()/publish() avalent et loggent leurs erreurs).
    void this.push.broadcast({
      title: `Nouveau ticket ${saved.priority} · ${saved.tenant}`,
      body: saved.subject,
      url: '/tickets',
      tag: `ticket-${saved.id}`,
    });
    void this.notify.ticketCreated({
      id: saved.id,
      subject: saved.subject,
      tenant: saved.tenant,
      priority: saved.priority,
    });
    return saved;
  }

  async addReply(id: number, dto: AddReplyDto) {
    const ticket = await this.findOne(id);
    ticket.replies = [
      ...(ticket.replies ?? []),
      { from: dto.from, t: dto.t ?? 'à l’instant', text: dto.text, visibility: dto.visibility ?? 'internal' },
    ];
    ticket.updatedAt = new Date();
    return this.repo.save(ticket);
  }

  async setStatus(id: number, status: TicketStatus) {
    const ticket = await this.findOne(id);
    // No Owner/admin override — a closed ticket is not reopenable by
    // anyone, matching WorkItem.assertMutable()'s posture. Narrower than
    // WorkItem's guard: this only blocks further *status* changes, not
    // every mutation (replies/assignment on a closed ticket still go
    // through unguarded).
    if (ticket.status === 'closed') {
      throw new ForbiddenException(`Ticket #${ticket.id} est fermé et ne peut plus changer de statut.`);
    }
    ticket.status = status;
    ticket.updatedAt = new Date();
    return this.repo.save(ticket);
  }

  async assign(id: number, assignee: string) {
    const ticket = await this.findOne(id);
    ticket.assignee = assignee;
    ticket.assigned = assignee;
    ticket.updatedAt = new Date();
    const saved = await this.repo.save(ticket);
    // Fire-and-forget, same posture as create() above.
    void this.notify.ticketAssigned({
      id: saved.id,
      subject: saved.subject,
      tenant: saved.tenant,
      assigneeId: assignee,
    });
    return saved;
  }

  async summary() {
    const all = await this.repo.find();
    const count = (s: TicketStatus) => all.filter((t) => t.status === s).length;
    return {
      total: all.length,
      open: count('open'),
      pending: count('pending'),
      resolved: count('resolved'),
      closed: count('closed'),
      p1_open: all.filter((t) => t.priority === 'P1' && t.status === 'open').length,
    };
  }
}
