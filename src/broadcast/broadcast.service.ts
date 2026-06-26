import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NolaClientService } from '@nola-hq/nola-sdk';
import { Broadcast } from './broadcast.entity';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';

@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    @InjectRepository(Broadcast)
    private readonly repo: Repository<Broadcast>,
    private readonly nolaClient: NolaClientService,
  ) {}

  findAll() {
    return this.repo.find({ order: { createdAt: 'DESC' }, take: 100 });
  }

  async findOne(id: string) {
    const b = await this.repo.findOne({ where: { id } });
    if (!b) throw new NotFoundException(`Broadcast ${id} introuvable`);
    return b;
  }

  async create(dto: CreateBroadcastDto, author: string) {
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    const broadcast = this.repo.create({
      channel: dto.channel,
      subject: dto.subject,
      body: dto.body,
      recipients: dto.recipients,
      author,
      status: scheduledAt ? 'scheduled' : 'draft',
      createdAt: new Date(),
      scheduledAt,
      sentAt: null,
      sentCount: 0,
      sendError: null,
    });
    return this.repo.save(broadcast);
  }

  /**
   * Dispatch a broadcast for real.
   *
   * Idempotent on the broadcast row: a broadcast already in `sent` state is
   * returned untouched (never re-sent) — the operator double-clicking the
   * "Envoyer" button cannot fan a second blast out.
   *
   * Transport per channel:
   *   - `email` / `whatsapp` → one `nola.commands.notify.send` publish per
   *     recipient on the cross-app bus (the same subject the incident
   *     bridge + auto-invite flow use). nola-notify renders the `_inline`
   *     template (subject+body verbatim) and dispatches through the
   *     configured provider. A deterministic `idempotencyKey` per recipient
   *     lets nola-notify dedup if the publish is retried.
   *   - `in-app` → delivery IS persistence: the in-app feed reads the
   *     broadcast row via `GET /broadcasts`, so there is no external
   *     transport to call. We mark it delivered to every recipient.
   *
   * A draft with zero recipients is rejected (nothing to send).
   */
  async send(id: string) {
    const b = await this.findOne(id);

    // Idempotence guard — never re-send an already-sent broadcast.
    if (b.status === 'sent') {
      return b;
    }

    const recipients = Array.isArray(b.recipients) ? b.recipients : [];
    if (recipients.length === 0) {
      throw new BadRequestException({
        code: 'no_recipients',
        message: 'Cannot send a broadcast with no recipients.',
      });
    }

    if (b.channel === 'in-app') {
      // In-app delivery = the persisted row, surfaced by GET /broadcasts.
      b.status = 'sent';
      b.sentAt = new Date();
      b.sentCount = recipients.length;
      b.sendError = null;
      return this.repo.save(b);
    }

    // email / whatsapp → real dispatch via nola-notify.
    if (!this.nolaClient.isReady()) {
      throw new ServiceUnavailableException({
        code: 'nola_client_offline',
        message: 'NATS not connected — cannot dispatch broadcast right now.',
      });
    }

    const client = this.nolaClient.getClient();
    let delivered = 0;
    const failures: string[] = [];
    for (let i = 0; i < recipients.length; i++) {
      const to = recipients[i];
      try {
        await client.publish('nola.commands.notify.send', {
          channel: b.channel,
          to,
          template: '_inline',
          variables: { subject: b.subject, body: b.body },
          idempotencyKey: `hq-broadcast-${b.id}-${i}`,
          realm: 'nola-hq',
          tenantId: 'nola-studio',
        });
        delivered += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`broadcast ${b.id} recipient[${i}] publish failed: ${msg}`);
        failures.push(`${to}: ${msg}`);
      }
    }

    b.sentCount = delivered;
    b.sentAt = new Date();
    if (failures.length === 0) {
      b.status = 'sent';
      b.sendError = null;
    } else if (delivered === 0) {
      // Nothing went out — keep it re-sendable and mark failed.
      b.status = 'failed';
      b.sentAt = null;
      b.sendError = failures.slice(0, 5).join(' | ').slice(0, 500);
    } else {
      // Partial — mark sent (so we don't blast the delivered ones again)
      // but record the failures for the operator.
      b.status = 'sent';
      b.sendError = `partial: ${failures.length}/${recipients.length} failed — ${failures
        .slice(0, 3)
        .join(' | ')}`.slice(0, 500);
    }
    return this.repo.save(b);
  }

  async remove(id: string) {
    const b = await this.findOne(id);
    await this.repo.remove(b);
    return { ok: true };
  }
}
