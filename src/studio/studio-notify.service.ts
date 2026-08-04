import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NolaClientService } from '@nola-hq/nola-sdk';
import { TeamMember } from '../team/team-member.entity';

/**
 * Publishes `nola.commands.notify.send` for Studio's two email triggers
 * (task assigned, task due soon) — same subject/shape as
 * `NotificationsService.sendTest` and the auto-invite/billing flows.
 *
 * Unlike nola-platform's version, `assigneeEmail` already **is** the
 * recipient's real email (Studio's soft references point at
 * `team_members.email`, not an opaque Keycloak sub) — only the display
 * name needs a lookup.
 *
 * Known gap: the `studio.task_assigned` / `studio.task_due_soon` templates
 * this publishes against must be registered in nola-notify's own template
 * store — a separate repo/service this codebase has no access to. Until
 * they exist there, the command is published but nola-notify will reject
 * or drop it silently depending on its unknown-template handling.
 */
@Injectable()
export class StudioNotifyService {
  private readonly logger = new Logger(StudioNotifyService.name);

  constructor(
    private readonly nolaClient: NolaClientService,
    @InjectRepository(TeamMember)
    private readonly team: Repository<TeamMember>,
  ) {}

  private async displayName(email: string): Promise<string> {
    const member = await this.team.findOne({ where: { email } });
    return member?.name ?? email;
  }

  async taskAssigned(input: { identifier: string; title: string; assigneeEmail: string; dueDate: string | null }) {
    await this.publish('studio.task_assigned', input.assigneeEmail, {
      identifier: input.identifier,
      title: input.title,
      assigneeName: await this.displayName(input.assigneeEmail),
      dueDate: input.dueDate ?? '',
    });
  }

  async taskDueSoon(input: { identifier: string; title: string; assigneeEmail: string; dueDate: string }) {
    await this.publish('studio.task_due_soon', input.assigneeEmail, {
      identifier: input.identifier,
      title: input.title,
      assigneeName: await this.displayName(input.assigneeEmail),
      dueDate: input.dueDate,
    });
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
    } catch (err) {
      this.logger.error(`publish failed for ${template}/${to}: ${err instanceof Error ? err.message : err}`);
    }
  }
}
