import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Deploy } from './deploy.entity';
import { CreateDeployDto } from './dto/create-deploy.dto';

@Injectable()
export class DeploysService {
  constructor(
    @InjectRepository(Deploy) private readonly repo: Repository<Deploy>,
  ) {}

  list(app?: string, env?: string) {
    const where: Partial<Deploy> = {};
    if (app) where.app = app;
    if (env) where.env = env;
    return this.repo.find({ where, order: { id: 'DESC' }, take: 200 });
  }

  async findOne(id: string) {
    const d = await this.repo.findOne({ where: { id } });
    if (!d) throw new NotFoundException(`Déploiement ${id} introuvable`);
    return d;
  }

  async create(dto: CreateDeployDto) {
    const id = dto.id ?? (await this.nextId());
    return this.repo.save(
      this.repo.create({
        id,
        app: dto.app,
        version: dto.version,
        env: dto.env,
        author: dto.author,
        t: dto.t ?? 'à l’instant',
        status: dto.status ?? 'success',
        sha: dto.sha,
        changelog: dto.changelog,
      }),
    );
  }

  async rollback(id: string) {
    const d = await this.findOne(id);
    d.status = 'rolled-back';
    return this.repo.save(d);
  }

  private async nextId() {
    const last = await this.repo
      .createQueryBuilder('d')
      .orderBy('d.id', 'DESC')
      .getOne();
    if (!last) return 'd-001';
    const num = parseInt(last.id.replace(/[^0-9]/g, ''), 10) || 0;
    return 'd-' + String(num + 1).padStart(3, '0');
  }
}
