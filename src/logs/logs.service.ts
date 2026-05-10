import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LogEntry, LogLevel } from './log.entity';
import { PaginationDto, type PaginatedResult } from '../common/dto/pagination.dto';

export interface LogQuery extends PaginationDto {
  svc?: string;
  lvl?: LogLevel;
}

@Injectable()
export class LogsService {
  constructor(
    @InjectRepository(LogEntry) private readonly repo: Repository<LogEntry>,
  ) {}

  async list(query: LogQuery): Promise<PaginatedResult<LogEntry>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 100;
    const qb = this.repo.createQueryBuilder('l');
    if (query.svc) qb.andWhere('l.svc = :svc', { svc: query.svc });
    if (query.lvl) qb.andWhere('l.lvl = :lvl', { lvl: query.lvl });
    if (query.q) {
      qb.andWhere('LOWER(l.msg) LIKE :q', { q: `%${query.q.toLowerCase()}%` });
    }
    qb.orderBy('l.createdAt', 'DESC');
    const total = await qb.getCount();
    const items = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    return { items, total, page, limit };
  }

  async ingest(svc: string, lvl: LogLevel, msg: string) {
    return this.repo.save(
      this.repo.create({
        svc,
        lvl,
        msg,
        ts: new Date().toISOString().split('T')[1].slice(0, 12),
        createdAt: new Date(),
      }),
    );
  }
}
