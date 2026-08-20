import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NolaClientService } from '@nola-hq/nola-sdk';
import { TeamMember } from '../team/team-member.entity';

/**
 * Publishes `nola.commands.notify.send` for Studio's ticket-lifecycle email
 * triggers (created, assigned, due soon) — same subject/shape as
 * `NotificationsService.sendTest` and the auto-invite/billing flows.
 *
 * Unlike nola-platform's version, `assigneeEmail` already **is** the
 * recipient's real email (Studio's soft references point at
 * `team_members.email`, not an opaque Keycloak sub) — only the display
 * name needs a lookup.
 *
 * Known gap: the `studio.task_created` / `studio.task_assigned` /
 * `studio.task_due_soon` templates this publishes against must be
 * registered in nola-notify's own template store — a separate repo/service
 * this codebase has no access to. Until they exist there, the command is
 * published but nola-notify will reject or drop it silently depending on
 * its unknown-template handling.
 *
 * `publish()` has no way to confirm actual delivery — `nola.commands.notify.send`
 * is fire-and-forget over the bus, with no ack. Every successful publish is
 * logged at `warn` (not `log`) specifically so it reads as "dispatched,
 * delivery unconfirmed" rather than "sent" — this codebase already has a
 * pattern of assuming success it can't verify, and this is deliberately not
 * a fourth instance of it.
 */
@Injectable()
export class StudioNotifyService {
  private readonly logger = new Logger(StudioNotifyService.name);

  constructor(
    private readonly nolaClient: NolaClientService,
    @InjectRepository(TeamMember)
    private readonly team: Repository<TeamMember>,
    private readonly config?: ConfigService,
  ) {}

  private async displayName(email: string): Promise<string> {
    const member = await this.team.findOne({ where: { email } });
    return member?.name ?? email;
  }

  /** Configurable shared mailbox CC'd on every ticket event — never hardcoded. */
  private mailbox(): string | undefined {
    return this.config?.get<string>('STUDIO_TICKETS_CC_EMAIL') ?? undefined;
  }

  async taskCreated(input: {
    identifier: string;
    title: string;
    assigneeEmail: string | null;
    dueDate: string | null;
  }) {
    const variables = {
      identifier: input.identifier,
      title: input.title,
      assigneeName: input.assigneeEmail ? await this.displayName(input.assigneeEmail) : 'Non assigné',
      dueDate: input.dueDate ?? '',
    };
    await this.notifyMailbox('studio.task_created', variables);
  }

  async taskAssigned(input: { identifier: string; title: string; assigneeEmail: string; dueDate: string | null }) {
    const variables = {
      identifier: input.identifier,
      title: input.title,
      assigneeName: await this.displayName(input.assigneeEmail),
      dueDate: input.dueDate ?? '',
    };
    await this.publish('studio.task_assigned', input.assigneeEmail, variables);
    await this.notifyMailbox('studio.task_assigned', variables);
  }

  async taskDueSoon(input: { identifier: string; title: string; assigneeEmail: string; dueDate: string }) {
    const variables = {
      identifier: input.identifier,
      title: input.title,
      assigneeName: await this.displayName(input.assigneeEmail),
      dueDate: input.dueDate,
    };
    await this.publish('studio.task_due_soon', input.assigneeEmail, variables);
    await this.notifyMailbox('studio.task_due_soon', variables);
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
        idempotencyKey: `studio-${template}-${to}-${Date.now()}`,
        realm: 'nola-hq',
        tenantId: 'nola-studio',
      });
      this.logger.warn(`notify dispatched, delivery not confirmed — template=${template} to=${to}`);
    } catch (err) {
      this.logger.error(`publish failed for ${template}/${to}: ${err instanceof Error ? err.message : err}`);
    }
  }
}
