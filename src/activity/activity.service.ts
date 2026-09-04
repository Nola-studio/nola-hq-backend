import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { type ActivityCategory, ActivityEvent } from './activity.entity';
import { PaginationDto, type PaginatedResult } from '../common/dto/pagination.dto';

export interface ActivityQuery extends PaginationDto {
  cat?: ActivityCategory;
  actor?: string;
  ref?: string;
}

export interface CreateActivityDto {
  cat: ActivityCategory;
  actor: string;
  text: string;
  ref?: string | null;
  t?: string;
}

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(ActivityEvent)
    private readonly repo: Repository<ActivityEvent>,
  ) {}

  async list(query: ActivityQuery): Promise<PaginatedResult<ActivityEvent>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const qb = this.repo.createQueryBuilder('a');
    if (query.cat) qb.andWhere('a.cat = :cat', { cat: query.cat });
    if (query.actor) qb.andWhere('a.actor = :actor', { actor: query.actor });
    if (query.ref) qb.andWhere('a.ref = :ref', { ref: query.ref });
    if (query.q) {
      qb.andWhere('LOWER(a.text) LIKE :q', { q: `%${query.q.toLowerCase()}%` });
    }
    qb.orderBy('a.createdAt', 'DESC');
    const total = await qb.getCount();
    const items = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    return { items, total, page, limit };
  }

  async record(dto: CreateActivityDto) {
    return this.repo.save(
      this.repo.create({
        cat: dto.cat,
        actor: dto.actor,
        text: dto.text,
        ref: dto.ref ?? null,
        t: dto.t ?? 'à l’instant',
        createdAt: new Date(),
      }),
    );
  }
}
