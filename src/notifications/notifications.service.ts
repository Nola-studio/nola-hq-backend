import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { NolaClientService } from '@nola-hq/nola-sdk';
import { Notification, type NotificationKind } from './notification.entity';

export interface CreateNotificationInput {
  kind: NotificationKind;
  ticketId?: number | null;
  title: string;
  body?: string | null;
  url?: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification) private readonly repo: Repository<Notification>,
    private readonly nolaClient: NolaClientService,
  ) {}

  // ── Per-recipient in-app notifications ──────────────────────────────

  /**
   * One row per recipient, same trigger, same content — the fan-out a
   * single `TicketEvent` can't represent. `recipientIds` is expected
   * pre-resolved and pre-deduplicated by the caller (see
   * `TeamService.membersForBusinessUnit` / the single-assignee case);
   * this method doesn't second-guess who should receive it.
   */
  async createForRecipients(recipientIds: string[], input: CreateNotificationInput): Promise<Notification[]> {
    if (recipientIds.length === 0) return [];
    const now = new Date();
    const rows = recipientIds.map((recipientId) =>
      this.repo.create({
        recipientId,
        kind: input.kind,
        ticketId: input.ticketId ?? null,
        title: input.title,
        body: input.body ?? null,
        url: input.url ?? null,
        readAt: null,
        clearedAt: null,
        createdAt: now,
      }),
    );
    return this.repo.save(rows);
  }

  /** Never-cleared, newest first — cleared notifications are excluded from every default view, never deleted. */
  async list(recipientId: string): Promise<Notification[]> {
    return this.repo.find({
      where: { recipientId, clearedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async unreadCount(recipientId: string): Promise<number> {
    return this.repo.count({ where: { recipientId, readAt: IsNull(), clearedAt: IsNull() } });
  }

  /**
   * Scoped to `recipientId`, not just `id` — a notification's owner must
   * match the caller, or this 404s exactly like a ticket outside a
   * caller's brand scope does elsewhere in this codebase. Without this,
   * any authenticated user could mark/clear anyone else's row by
   * guessing a UUID.
   */
  async markRead(id: string, recipientId: string): Promise<Notification> {
    const row = await this.findOwned(id, recipientId);
    if (!row.readAt) {
      row.readAt = new Date();
      await this.repo.save(row);
    }
    return row;
  }

  async markAllRead(recipientId: string): Promise<{ updated: number }> {
    const result = await this.repo.update(
      { recipientId, readAt: IsNull(), clearedAt: IsNull() },
      { readAt: new Date() },
    );
    return { updated: result.affected ?? 0 };
  }

  async clear(id: string, recipientId: string): Promise<Notification> {
    const row = await this.findOwned(id, recipientId);
    if (!row.clearedAt) {
      row.clearedAt = new Date();
      await this.repo.save(row);
    }
    return row;
  }

  private async findOwned(id: string, recipientId: string): Promise<Notification> {
    const row = await this.repo.findOne({ where: { id, recipientId } });
    if (!row) throw new NotFoundException(`Notification ${id} introuvable`);
    return row;
  }

  // ── Operator test-send (nola-notify pipeline) ───────────────────────
  //
  // Predates the per-recipient model above and is otherwise unrelated to
  // it — an ops "send a test email/SMS/WhatsApp" capability that
  // publishes `nola.commands.notify.send` directly, same subject the
  // auto-invite/billing/incident-bridge flows use in production. Kept
  // in the same service/controller because both now live under
  // `/notifications`, not because they share any data model.

  async sendTest(input: {
    channel: 'email' | 'sms' | 'whatsapp';
    to: string;
    template: string;
    variables?: Record<string, string>;
    issuedBy?: string;
  }): Promise<{ published: boolean; subject: string; idempotencyKey: string }> {
    if (!this.nolaClient.isReady()) {
      throw new BadRequestException(
        'nola_client_offline — NATS not yet connected; retry in a few seconds',
      );
    }
    const idempotencyKey = `hq-test-${crypto.randomUUID()}`;
    try {
      await this.nolaClient.getClient().publish('nola.commands.notify.send', {
        channel: input.channel,
        to: input.to,
        template: input.template,
        variables: input.variables ?? {},
        idempotencyKey,
        realm: 'nola-hq',
        tenantId: 'nola-studio',
      });
      this.logger.log(
        `test notify sent: to=${input.to} template=${input.template} by=${input.issuedBy ?? 'unknown'}`,
      );
      return { published: true, subject: 'nola.commands.notify.send', idempotencyKey };
    } catch (err) {
      this.logger.error(
        `test notify publish failed: ${err instanceof Error ? err.message : err}`,
      );
      throw new BadRequestException(
        `publish_failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }
}
