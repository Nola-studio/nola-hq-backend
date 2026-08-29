import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Deploy } from './deploy.entity';
import { CreateDeployDto } from './dto/create-deploy.dto';
import { Ticket } from '../tickets/ticket.entity';
import { GithubService } from './github.service';
import { DEPLOYABLE_APPS } from './deployable-apps';

export interface AppCommitRange {
  app: string;
  repo: string | null;
  headSha?: string;
  baseSha?: string;
  aheadBy?: number;
  commits?: { sha: string; message: string; author: string; date: string }[];
  compareUrl?: string;
  error?: string;
}

@Injectable()
export class DeploysService {
  constructor(
    @InjectRepository(Deploy) private readonly repo: Repository<Deploy>,
    @InjectRepository(Ticket) private readonly tickets: Repository<Ticket>,
    private readonly github: GithubService,
  ) {}

  /**
   * Deployment ticket composer's data source: per app, what's actually
   * different between `dev` and `main` right now. Never fails the whole
   * request for one bad app — an unknown app id or an unreachable GitHub
   * call produces an `error` entry alongside whatever repos did resolve,
   * so filing a two-repo ticket doesn't die because one repo's compare
   * call timed out.
   */
  async commitRanges(apps: string[]): Promise<AppCommitRange[]> {
    return Promise.all(
      apps.map(async (app): Promise<AppCommitRange> => {
        const repo = DEPLOYABLE_APPS[app];
        if (!repo) return { app, repo: null, error: `Unknown app '${app}' — not in the deployable app map.` };
        const range = await this.github.commitRange(repo);
        if (!range) return { app, repo, error: 'GitHub compare unavailable — not configured or the request failed.' };
        return { app, repo, ...range };
      }),
    );
  }

  list(app?: string, env?: string) {
    const where: FindOptionsWhere<Deploy> = {};
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
    if (dto.ticketId !== undefined) {
      const ticket = await this.tickets.findOne({ where: { id: dto.ticketId } });
      if (!ticket) throw new NotFoundException(`Ticket ${dto.ticketId} introuvable`);
    }
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
        ticketId: dto.ticketId ?? null,
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
