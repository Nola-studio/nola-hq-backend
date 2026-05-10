import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Broadcast } from './broadcast.entity';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';

@Injectable()
export class BroadcastService {
  constructor(
    @InjectRepository(Broadcast)
    private readonly repo: Repository<Broadcast>,
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
    });
    return this.repo.save(broadcast);
  }

  async send(id: string) {
    const b = await this.findOne(id);
    b.status = 'sent';
    b.sentAt = new Date();
    return this.repo.save(b);
  }

  async remove(id: string) {
    const b = await this.findOne(id);
    await this.repo.remove(b);
    return { ok: true };
  }
}
