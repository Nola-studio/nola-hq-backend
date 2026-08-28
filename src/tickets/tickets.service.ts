import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Ticket, type TicketStatus } from './ticket.entity';
import { TicketEvent, type TicketEventAction } from './ticket-event.entity';
import {
  AddReplyDto,
  CreateTicketDto,
} from './dto/create-ticket.dto';
import { PaginationDto, type PaginatedResult } from '../common/dto/pagination.dto';
import { PushService } from '../push/push.service';
import { TicketsNotifyService } from './tickets-notify.service';
import { BusinessUnitResolverService, DEFAULT_BUSINESS_UNIT_CODE } from '../company/business-unit-resolver.service';
import { TeamMember } from '../team/team-member.entity';

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
    @InjectRepository(TicketEvent) private readonly events: Repository<TicketEvent>,
    @InjectRepository(TeamMember) private readonly team: Repository<TeamMember>,
    private readonly push: PushService,
    private readonly notify: TicketsNotifyService,
    private readonly businessUnits: BusinessUnitResolverService,
  ) {}

  async list(query: TicketsListQuery, roles?: string[]): Promise<PaginatedResult<TicketResponse>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const allowedUnitIds = await this.businessUnits.resolveAllowedUnits(roles);
    if (allowedUnitIds.length === 0) {
      return { items: [], total: 0, page, limit };
    }
    const qb = this.repo.createQueryBuilder('t').leftJoinAndSelect('t.businessUnit', 'businessUnit');
    qb.andWhere('t.businessUnitId IN (:...allowedUnitIds)', { allowedUnitIds });
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

  async findOne(id: number, roles?: string[]): Promise<TicketResponse> {
    const allowedUnitIds = await this.businessUnits.resolveAllowedUnits(roles);
    if (allowedUnitIds.length === 0) {
      throw new NotFoundException(`Ticket ${id} introuvable`);
    }
    const t = await this.repo.findOne({
      where: { id, businessUnitId: In(allowedUnitIds) },
      relations: ['businessUnit'],
    });
    if (!t) throw new NotFoundException(`Ticket ${id} introuvable`);
    return toTicketResponse(t);
  }

  async getEvents(id: number, roles?: string[]): Promise<TicketEvent[]> {
    await this.findOne(id, roles);
    return this.events.find({
      where: { ticketId: id },
      order: { createdAt: 'ASC' },
    });
  }

  async create(dto: CreateTicketDto, actor?: string) {
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
    void this.record(saved.id, actor ?? 'system', 'created', { toStatus: saved.status });
    return saved;
  }

  async addReply(id: number, dto: AddReplyDto, roles?: string[]) {
    const ticket = await this.findOne(id, roles);
    const visibility = dto.visibility ?? 'internal';
    ticket.replies = [
      ...(ticket.replies ?? []),
      { from: dto.from, t: dto.t ?? 'à l’instant', text: dto.text, visibility },
    ];
    ticket.updatedAt = new Date();
    const saved = await this.repo.save(ticket);
    // An internal note and a client-visible reply are different events —
    // that distinction matters once the portal reads tickets.
    void this.record(saved.id, dto.from, 'replied', { meta: { visibility } });
    return saved;
  }

  async setStatus(id: number, status: TicketStatus, roles?: string[], actor?: string) {
    const ticket = await this.findOne(id, roles);
    // Idempotent no-op: nothing is mutated, so nothing to guard — this
    // must come before the closed check below (re-submitting a closed
    // ticket's already-closed status isn't a reopen attempt).
    if (ticket.status === status) return ticket;
    // No Owner/admin override — a closed ticket is not reopenable by
    // anyone, matching WorkItem.assertMutable()'s posture. Narrower than
    // WorkItem's guard: this only blocks further *status* changes, not
    // every mutation (replies/assignment on a closed ticket still go
    // through unguarded).
    if (ticket.status === 'closed') {
      throw new ForbiddenException(`Ticket #${ticket.id} est fermé et ne peut plus changer de statut.`);
    }
    const fromStatus = ticket.status;
    ticket.status = status;
    ticket.updatedAt = new Date();
    const saved = await this.repo.save(ticket);
    void this.notifyStatusPush(saved, actor);
    void this.record(saved.id, actor ?? 'unknown', 'status_changed', { fromStatus, toStatus: status });
    return saved;
  }

  /** Mirrors notifyAssigneePush: same recipient (assignee), same self-actor guard, push only. */
  private async notifyStatusPush(ticket: Ticket, actor?: string) {
    const member = await this.team.findOne({ where: { id: ticket.assignee } });
    if (!member || (actor && member.email.toLowerCase() === actor.toLowerCase())) return;
    await this.push.sendTo(member.notifyEmail ?? member.email, {
      title: 'Statut du ticket modifié',
      body: ticket.subject.slice(0, 180),
      url: '/tickets',
      tag: `ticket-${ticket.id}`,
    });
  }

  async assign(id: number, assignee: string, roles?: string[], actor?: string) {
    const ticket = await this.findOne(id, roles);
    const previousAssignee = ticket.assignee;
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
    void this.notifyAssigneePush(saved, assignee, actor);
    void this.record(saved.id, actor ?? 'unknown', 'assigned', {
      meta: { fromAssignee: previousAssignee, toAssignee: assignee },
    });
    return saved;
  }

  /**
   * Write-only audit trail — no read endpoint yet, mirrors how
   * WorkItemEvent's own `history` sits unused by any timeline UI today.
   * fromStatus/toStatus/reason are first-class columns, unlike
   * WorkItemEvent's `record()`, which buries transitions like `moved`'s
   * `{ from, to }` inside `meta` where they can't be filtered or indexed.
   */
  private record(
    ticketId: number,
    actor: string,
    action: TicketEventAction,
    opts: {
      fromStatus?: TicketStatus | null;
      toStatus?: TicketStatus | null;
      reason?: string | null;
      meta?: Record<string, unknown>;
    } = {},
  ) {
    return this.events.save(
      this.events.create({
        ticketId,
        actor,
        action,
        fromStatus: opts.fromStatus ?? null,
        toStatus: opts.toStatus ?? null,
        reason: opts.reason ?? null,
        meta: opts.meta ?? {},
        createdAt: new Date(),
      }),
    );
  }

  /** Mirrors WorkItemsService.notifyAssignee: skip when self-assigning, never fail the assignment. */
  private async notifyAssigneePush(ticket: Ticket, assignee: string, actor?: string) {
    const member = await this.team.findOne({ where: { id: assignee } });
    if (!member || (actor && member.email.toLowerCase() === actor.toLowerCase())) return;
    await this.push.sendTo(member.notifyEmail ?? member.email, {
      title: 'Ticket assigné',
      body: ticket.subject.slice(0, 180),
      url: '/tickets',
      tag: `ticket-${ticket.id}`,
    });
  }

  async summary(roles?: string[]) {
    const allowedUnitIds = await this.businessUnits.resolveAllowedUnits(roles);
    if (allowedUnitIds.length === 0) {
      return {
        total: 0,
        open: 0,
        pending: 0,
        resolved: 0,
        closed: 0,
        p1_open: 0,
      };
    }
    const all = await this.repo.find({ where: { businessUnitId: In(allowedUnitIds) } });
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
