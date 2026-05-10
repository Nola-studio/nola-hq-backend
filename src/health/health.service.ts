import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HealthEntry } from './health-entry.entity';

@Injectable()
export class HealthService {
  constructor(
    @InjectRepository(HealthEntry)
    private readonly repo: Repository<HealthEntry>,
  ) {}

  findAll() {
    return this.repo.find();
  }

  async findOne(id: string) {
    const h = await this.repo.findOne({ where: { id } });
    if (!h) throw new NotFoundException(`Health ${id} introuvable`);
    return h;
  }

  async overall() {
    const entries = await this.repo.find();
    const operational = entries.filter((e) => e.status === 'operational').length;
    const degraded = entries.filter((e) => e.status === 'degraded').length;
    const avgUptime = entries.length
      ? entries.reduce((s, e) => s + e.uptime, 0) / entries.length
      : 0;
    return {
      total: entries.length,
      operational,
      degraded,
      avg_uptime: Number(avgUptime.toFixed(3)),
      total_errors_24h: entries.reduce((s, e) => s + e.errors24h, 0),
    };
  }
}
