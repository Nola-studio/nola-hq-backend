import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Ticket } from './ticket.entity';
import { TicketEvent, type TicketEventAction } from './ticket-event.entity';
import { computeActiveMs, type TicketStatusPoint } from './sla-elapsed';
import { SlaPolicy } from '../sla/sla-policy.entity';
import { TeamMember } from '../team/team-member.entity';
import { PushService } from '../push/push.service';

/** Alert at 80% of target elapsed — a percentage, not a fixed lead time,
 * because targets in this system range from 15 minutes (Vantelis P1) to
 * multi-day and unconfigured. A fixed lead time would fire at ticket
 * creation for the tightest targets and be meaningless for the loosest. */
const APPROACHING_THRESHOLD = 0.8;

const RESPONSE_LABEL = 'réponse';
const RESOLUTION_LABEL = 'résolution';

interface Clock {
  label: string;
  targetMinutes: number | null;
  /** True when this clock has already stopped for good (e.g. response
   * clock once the client's had a reply) — nothing left to check. */
  alreadyStopped: boolean;
  elapsedMs: number;
  approachingAction: TicketEventAction;
  breachedAction: TicketEventAction;
}

/**
 * Sweeps every open/pending ticket every 2 minutes, checks each against its
 * brand+priority `sla_policies` row, and alerts once when a clock crosses
 * 80% of target (never re-alerting — see `TicketEventSlaAlertIndex`'s
 * partial unique index). A brand/priority with no policy row, or a policy
 * with a null target, simply produces no alert for that clock — same
 * null-tolerant shape as any other feature that skips rows with nothing
 * configured rather than guessing a default.
 *
 * Only 'approaching' pushes a notification. 'breached' is recorded
 * unconditionally (per-clock, once) so the data exists for future SLA
 * reporting, but does not alert here — Roy's ask was alerts *before*
 * breach; alerting on breach itself is a separate decision this phase
 * doesn't make.
 */
@Injectable()
export class TicketsSlaBreachScheduler {
  private readonly logger = new Logger(TicketsSlaBreachScheduler.name);

  constructor(
    @InjectRepository(Ticket) private readonly tickets: Repository<Ticket>,
    @InjectRepository(TicketEvent) private readonly events: Repository<TicketEvent>,
    @InjectRepository(SlaPolicy) private readonly policies: Repository<SlaPolicy>,
    @InjectRepository(TeamMember) private readonly team: Repository<TeamMember>,
    private readonly push: PushService,
  ) {}

  @Cron('*/2 * * * *')
  async handleCron() {
    await this.run();
  }

  async run() {
    const openTickets = await this.tickets.find({
      where: { status: Not(In(['resolved', 'closed'])) },
    });
    if (openTickets.length === 0) return;

    const policyRows = await this.policies.find();
    const policyByKey = new Map(policyRows.map((p) => [`${p.businessUnitId}:${p.priority}`, p]));

    const ticketIds = openTickets.map((t) => t.id);
    const allEvents = await this.events.find({
      where: { ticketId: In(ticketIds) },
      order: { createdAt: 'ASC' },
    });
    const eventsByTicket = new Map<number, TicketEvent[]>();
    for (const event of allEvents) {
      const list = eventsByTicket.get(event.ticketId) ?? [];
      list.push(event);
      eventsByTicket.set(event.ticketId, list);
    }

    const now = new Date();
    for (const ticket of openTickets) {
      const policy = policyByKey.get(`${ticket.businessUnitId}:${ticket.priority}`);
      if (!policy) continue; // brand/priority not tracked at all — no alert, no error
      await this.checkTicket(ticket, policy, eventsByTicket.get(ticket.id) ?? [], now);
    }
  }

  private async checkTicket(ticket: Ticket, policy: SlaPolicy, events: TicketEvent[], now: Date): Promise<void> {
    const points: TicketStatusPoint[] = events
      .filter((e) => e.toStatus != null)
      .map((e) => ({
        toStatus: e.toStatus!,
        pendingReason: (e.meta?.pendingReason as Ticket['pendingReason']) ?? null,
        createdAt: e.createdAt,
      }));

    const firstClientReply = events.find(
      (e) => e.action === 'replied' && (e.meta as { visibility?: string } | null)?.visibility === 'client',
    );
    const responseStoppedAt = firstClientReply?.createdAt ?? null;

    const clocks: Clock[] = [
      {
        label: RESPONSE_LABEL,
        targetMinutes: policy.responseTargetMinutes,
        alreadyStopped: responseStoppedAt != null,
        elapsedMs: computeActiveMs(points, responseStoppedAt, now),
        approachingAction: 'sla_response_approaching',
        breachedAction: 'sla_response_breached',
      },
      {
        label: RESOLUTION_LABEL,
        targetMinutes: policy.resolutionTargetMinutes,
        // The ticket is in the active sweep (not resolved/closed), so this
        // clock is definitionally still running right now regardless of
        // any earlier resolved spell before a reopen.
        alreadyStopped: false,
        elapsedMs: computeActiveMs(points, null, now),
        approachingAction: 'sla_resolution_approaching',
        breachedAction: 'sla_resolution_breached',
      },
    ];

    for (const clock of clocks) {
      if (clock.targetMinutes == null) continue; // unconfigured — no alert

      const targetMs = clock.targetMinutes * 60_000;
      if (clock.elapsedMs >= targetMs) {
        // Recorded regardless of whether the clock has already stopped —
        // a ticket that was answered late still breached its response
        // target, and that fact belongs on record for reporting even
        // though there's nothing left to warn anyone about now.
        await this.recordOnce(ticket, clock.breachedAction);
      } else if (!clock.alreadyStopped && clock.elapsedMs >= targetMs * APPROACHING_THRESHOLD) {
        // Only meaningful for a clock still running — "approaching" a
        // target that's already been met is nothing to warn about.
        const firstTime = await this.recordOnce(ticket, clock.approachingAction);
        if (firstTime) await this.alert(ticket, clock);
      }
    }
  }

  /** Returns true the first time this action is recorded for this ticket, false if already recorded (unique violation). */
  private async recordOnce(ticket: Ticket, action: TicketEventAction): Promise<boolean> {
    try {
      await this.events.save(
        this.events.create({
          ticketId: ticket.id,
          actor: 'system',
          action,
          createdAt: new Date(),
          meta: {},
        }),
      );
      return true;
    } catch {
      // Unique constraint violation on (ticket_id, action) ⇒ already recorded.
      return false;
    }
  }

  private async alert(ticket: Ticket, clock: Clock): Promise<void> {
    const title = `SLA ${clock.label} bientôt dépassé · Ticket #${ticket.id}`;
    const body = ticket.subject.slice(0, 180);
    const url = '/tickets';
    const tag = `ticket-${ticket.id}-${clock.approachingAction}`;

    const member =
      ticket.assignee && ticket.assignee !== 'unassigned'
        ? await this.team.findOne({ where: { id: ticket.assignee } })
        : null;

    if (member) {
      await this.push.sendTo(member.notifyEmail ?? member.email, { title, body, url, tag });
    } else {
      // Unassigned P1 approaching breach is the case that most needs
      // someone — anyone — to see it, so broadcast rather than drop it.
      await this.push.broadcast({ title, body, url, tag });
    }
    this.logger.log(`${clock.approachingAction} alerted for ticket #${ticket.id}`);
  }
}
