import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MomoEntry } from './momo-entry.entity';
import { CreateMomoDto } from './dto/create-momo.dto';
import { ListMomoDto } from './dto/list-momo.dto';
import type { PaginatedResult } from '../common/dto/pagination.dto';

@Injectable()
export class MomoService {
  constructor(
    @InjectRepository(MomoEntry)
    private readonly repo: Repository<MomoEntry>,
  ) {}

  async list(query: ListMomoDto): Promise<PaginatedResult<MomoEntry>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const qb = this.repo.createQueryBuilder('m');
    if (query.provider) qb.andWhere('m.provider = :p', { p: query.provider });
    if (query.tenant) qb.andWhere('m.tenant = :t', { t: query.tenant });
    if (query.kind) qb.andWhere('m.kind = :k', { k: query.kind });
    qb.orderBy('m.id', 'DESC');
    const total = await qb.getCount();
    const items = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    return { items, total, page, limit };
  }

  async create(dto: CreateMomoDto) {
    return this.repo.save(this.repo.create({ ...dto, tenant: dto.tenant ?? null }));
  }

  async summary() {
    const all = await this.repo.find();
    const inFlows = all.filter((m) => m.kind === 'in');
    const payouts = all.filter((m) => m.kind === 'payout');
    const byProvider: Record<string, number> = {};
    inFlows.forEach((m) => {
      byProvider[m.provider] = (byProvider[m.provider] ?? 0) + m.amt;
    });
    return {
      total_in_cdf: inFlows.reduce((s, m) => s + m.amt, 0),
      total_payout_cdf: payouts.reduce((s, m) => s + m.amt, 0),
      tx_count: all.length,
      by_provider: byProvider,
    };
  }
}
