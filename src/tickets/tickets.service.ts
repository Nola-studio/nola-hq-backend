import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Ticket, type TicketStatus, type TicketPendingReason, type TicketPriority } from './ticket.entity';
import { TicketEvent, type TicketEventAction } from './ticket-event.entity';
import {
  AddReplyDto,
  CreateTicketDto,
  UpdateTicketDto,
} from './dto/create-ticket.dto';
import { PaginationDto, type PaginatedResult } from '../common/dto/pagination.dto';
import { PushService } from '../push/push.service';
import { TicketsNotifyService } from './tickets-notify.service';
import { BusinessUnitResolverService, DEFAULT_BUSINESS_UNIT_CODE } from '../company/business-unit-resolver.service';
import { TeamMember } from '../team/team-member.entity';
import { SlaPolicy } from '../sla/sla-policy.entity';

/** Reserved sentinel for "nobody yet" — the ingest listener creates tickets
 * this way. The only `assignee` value exempt from the team_members check. */
const UNASSIGNED = 'unassigned';

/** e.g. 15 -> '15 min', 240 -> '4h', 90 -> '1h30'. Matches the shape the
 * hardcoded '24h' default always had — this just makes it true. */
function formatSlaMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${Math.floor(minutes / 60)}h${minutes % 60}`;
}

export interface TicketsListQuery extends PaginationDto {
  tenant?: string;
  status?: string;
  assignee?: string;
  priority?: string;
  category?: string;
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
    @InjectRepository(SlaPolicy) private readonly slaPolicies: Repository<SlaPolicy>,
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
    if (query.category)
      qb.andWhere('t.category = :category', { category: query.category });
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
    await this.assertValidAssignee(dto.assignee);
    const now = new Date();
    if (!dto.businessUnitCode) {
      this.logger.debug(
        `create(): no businessUnitCode supplied, defaulting to '${DEFAULT_BUSINESS_UNIT_CODE}'`,
      );
    }
    const businessUnitId = await this.businessUnits.resolve(dto.businessUnitCode ?? DEFAULT_BUSINESS_UNIT_CODE);
    const sla = await this.deriveSla(businessUnitId, dto.priority);
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
      sla,
      category: dto.category ?? null,
      source: dto.source ?? null,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      businessUnitId,
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

  async setStatus(
    id: number,
    status: TicketStatus,
    roles?: string[],
    actor?: string,
    pendingReason?: TicketPendingReason,
  ) {
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
    // Only meaningful while pending — null (never specified, or explicitly
    // 'client') is the SLA-pausing default; any other transition clears it
    // so a stale reason can't linger into a future, different pending spell.
    ticket.pendingReason = status === 'pending' ? pendingReason ?? null : null;
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
    await this.assertValidAssignee(assignee);
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

  async update(id: number, dto: UpdateTicketDto, roles?: string[], actor?: string) {
    const ticket = await this.findOne(id, roles);
    const changes: Record<string, unknown> = {};

    if (dto.priority !== undefined && dto.priority !== ticket.priority) {
      changes.fromPriority = ticket.priority;
      changes.toPriority = dto.priority;
      ticket.priority = dto.priority;
    }

    if (dto.category !== undefined && dto.category !== ticket.category) {
      changes.fromCategory = ticket.category;
      changes.toCategory = dto.category;
      ticket.category = dto.category;
    }

    if (Object.keys(changes).length > 0) {
      ticket.updatedAt = new Date();
      const saved = await this.repo.save(ticket);
      void this.record(saved.id, actor ?? 'unknown', 'updated', {
        meta: changes,
      });
      return saved;
    }

    return ticket;
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

  /**
   * `assignee` used to be pure free text: a typo or a stale id was accepted
   * silently, and the only symptom was a notification that quietly never
   * fired. That's tolerable for routine tickets but not for the deployment
   * gate — an approval "assigned" to a ghost id defeats the whole point.
   * `UNASSIGNED` stays exempt: the ingest listener creates tickets with no
   * owner yet, and that's a real, valid state, not a typo.
   */
  private async assertValidAssignee(assignee: string): Promise<void> {
    if (assignee === UNASSIGNED) return;
    const member = await this.team.findOne({ where: { id: assignee } });
    if (!member) {
      throw new BadRequestException(`Assignee '${assignee}' n'est pas un membre de l'équipe connu.`);
    }
  }

  /**
   * Computed once at creation from `sla_policies` (business unit × priority)
   * — like every other field on `Ticket`, this is written once and left, not
   * recomputed live on every read. A policy changed after the fact won't
   * retroactively update already-created tickets' displayed SLA; that's a
   * deliberate scope cut, not an oversight — this fixes the "always says
   * 24h" lie, it doesn't promise a live-updating figure.
   *
   * No policy row, or a row with no resolution target configured yet, both
   * mean the same thing here: nothing to show. Blank, never a fallback
   * default — the whole point was to stop displaying a number nobody set.
   */
  private async deriveSla(businessUnitId: string, priority: TicketPriority): Promise<string> {
    const policy = await this.slaPolicies.findOne({ where: { businessUnitId, priority } });
    const minutes = policy?.resolutionTargetMinutes;
    return minutes ? formatSlaMinutes(minutes) : '';
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
