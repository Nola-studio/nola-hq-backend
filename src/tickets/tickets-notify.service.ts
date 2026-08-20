import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NolaClientService } from '@nola-hq/nola-sdk';
import { TeamMember } from '../team/team-member.entity';

/**
 * Publishes `nola.commands.notify.send` for support-ticket lifecycle email
 * triggers (created, assigned) — same shape as `StudioNotifyService`
 * (Studio's task-lifecycle emails), kept as a separate service because the
 * recipient resolution differs: `Ticket.assignee` is a `TeamMember.id`
 * (see `Tickets.tsx`'s `ticketActions.assign(id, m.id)`), not an email, so
 * it needs a lookup — and per `TeamMember.notifyEmail`'s own doc comment
 * ("where ticket notifications are actually sent"), that field (falling
 * back to `email`) is the intended recipient, not the Keycloak login
 * address directly.
 *
 * Same known gap as `StudioNotifyService`: the `tickets.ticket_created` /
 * `tickets.ticket_assigned` templates this publishes against must be
 * registered in nola-notify's own template store, a separate repo/service
 * this codebase has no access to — until they exist there, the command is
 * published but nola-notify will reject or drop it silently.
 */
@Injectable()
export class TicketsNotifyService {
  private readonly logger = new Logger(TicketsNotifyService.name);

  constructor(
    private readonly nolaClient: NolaClientService,
    @InjectRepository(TeamMember)
    private readonly team: Repository<TeamMember>,
    private readonly config?: ConfigService,
  ) {}

  private async recipient(memberId: string): Promise<{ email: string; name: string } | null> {
    const member = await this.team.findOne({ where: { id: memberId } });
    if (!member) return null;
    const email = member.notifyEmail ?? member.email;
    if (!email) return null;
    return { email, name: member.name };
  }

  /** Configurable shared mailbox CC'd on every ticket event — never hardcoded. */
  private mailbox(): string | undefined {
    return this.config?.get<string>('TICKETS_CC_EMAIL') ?? undefined;
  }

  async ticketCreated(input: { id: number; subject: string; tenant: string; priority: string }) {
    const variables = {
      id: String(input.id),
      subject: input.subject,
      tenant: input.tenant,
      priority: input.priority,
    };
    await this.notifyMailbox('tickets.ticket_created', variables);
  }

  async ticketAssigned(input: { id: number; subject: string; tenant: string; assigneeId: string }) {
    const to = await this.recipient(input.assigneeId);
    if (!to) {
      this.logger.warn(`ticket_assigned: no notifiable email for team member ${input.assigneeId} — skipped`);
      return;
    }
    const variables = {
      id: String(input.id),
      subject: input.subject,
      tenant: input.tenant,
      assigneeName: to.name,
    };
    await this.publish('tickets.ticket_assigned', to.email, variables);
    await this.notifyMailbox('tickets.ticket_assigned', variables);
  }

  /**
   * `NotificationRequest` has no `cc`/`bcc` field (nor does nola-notify's
   * consumer, as far as this repo can see) — so the shared mailbox gets its
   * own independent send rather than piggybacking on the primary one.
   */
  private async notifyMailbox(template: string, variables: Record<string, string>) {
    const mailbox = this.mailbox();
    if (!mailbox) return;
    await this.publish(template, mailbox, variables);
  }

  private async publish(template: string, to: string, variables: Record<string, string>) {
    if (!this.nolaClient.isReady()) {
      this.logger.warn(`nola_client_offline — skipped ${template} for ${to}`);
      return;
    }
    try {
      await this.nolaClient.getClient().publish('nola.commands.notify.send', {
        channel: 'email',
        to,
        template,
        variables,
        idempotencyKey: `tickets-${template}-${to}-${Date.now()}`,
        realm: 'nola-hq',
        tenantId: 'nola-studio',
      });
      this.logger.warn(`notify dispatched, delivery not confirmed — template=${template} to=${to}`);
    } catch (err) {
      this.logger.error(`publish failed for ${template}/${to}: ${err instanceof Error ? err.message : err}`);
    }
  }
}
