import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEntry } from './audit.entity';
import { PaginationDto, type PaginatedResult } from '../common/dto/pagination.dto';

export interface AuditQuery extends PaginationDto {
  actor?: string;
  action?: string;
  target?: string;
}

export interface CreateAuditDto {
  actor: string;
  action: string;
  target: string;
  ip: string;
  meta: string;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditEntry)
    private readonly repo: Repository<AuditEntry>,
  ) {}

  async list(query: AuditQuery): Promise<PaginatedResult<AuditEntry>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 100;
    const qb = this.repo.createQueryBuilder('a');
    if (query.actor) qb.andWhere('a.actor = :actor', { actor: query.actor });
    if (query.action) qb.andWhere('a.action = :action', { action: query.action });
    if (query.target) qb.andWhere('a.target = :target', { target: query.target });
    if (query.q) {
      qb.andWhere(
        '(LOWER(a.action) LIKE :q OR LOWER(a.target) LIKE :q OR LOWER(a.meta) LIKE :q)',
        { q: `%${query.q.toLowerCase()}%` },
      );
    }
    qb.orderBy('a.createdAt', 'DESC');
    const total = await qb.getCount();
    const items = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    return { items, total, page, limit };
  }

  async record(dto: CreateAuditDto) {
    const now = new Date();
    return this.repo.save(
      this.repo.create({
        ...dto,
        createdAt: now,
        ts: now.toISOString().split('T')[1].slice(0, 8),
      }),
    );
  }
}
