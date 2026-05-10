import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket, TicketStatus } from './ticket.entity';
import {
  AddReplyDto,
  CreateTicketDto,
} from './dto/create-ticket.dto';
import { PaginationDto, type PaginatedResult } from '../common/dto/pagination.dto';

export interface TicketsListQuery extends PaginationDto {
  tenant?: string;
  status?: string;
  assignee?: string;
  priority?: string;
}

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket) private readonly repo: Repository<Ticket>,
  ) {}

  async list(query: TicketsListQuery): Promise<PaginatedResult<Ticket>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const qb = this.repo.createQueryBuilder('t');
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
    return { items, total, page, limit };
  }

  async findOne(id: number) {
    const t = await this.repo.findOne({ where: { id } });
    if (!t) throw new NotFoundException(`Ticket ${id} introuvable`);
    return t;
  }

  async create(dto: CreateTicketDto) {
    const now = new Date();
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
      age: '0 min',
      ago: '0 min',
      replies: [],
      createdAt: now,
      updatedAt: now,
    });
    return this.repo.save(ticket);
  }

  async addReply(id: number, dto: AddReplyDto) {
    const ticket = await this.findOne(id);
    ticket.replies = [
      ...(ticket.replies ?? []),
      { from: dto.from, t: dto.t ?? 'à l’instant', text: dto.text },
    ];
    ticket.updatedAt = new Date();
    return this.repo.save(ticket);
  }

  async setStatus(id: number, status: TicketStatus) {
    const ticket = await this.findOne(id);
    ticket.status = status;
    ticket.updatedAt = new Date();
    return this.repo.save(ticket);
  }

  async assign(id: number, assignee: string) {
    const ticket = await this.findOne(id);
    ticket.assignee = assignee;
    ticket.assigned = assignee;
    ticket.updatedAt = new Date();
    return this.repo.save(ticket);
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
