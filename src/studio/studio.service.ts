import { ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudioProject } from './studio-project.entity';
import { CreateProjectDto } from './dto/create-project.dto';

/** The fixed set of workstreams tasks are filed under. */
const DEFAULT_PROJECTS: Array<Pick<StudioProject, 'name' | 'key'>> = [
  { name: 'Yeko', key: 'YEK' },
  { name: 'Nola', key: 'NOLA' },
  { name: 'Studio', key: 'STU' },
];

/** Postgres `23505` / SQLite `SQLITE_CONSTRAINT` — a unique-key clash on `key`. */
function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string } | undefined)?.code;
  if (code === '23505' || code === 'SQLITE_CONSTRAINT') return true;
  const message = err instanceof Error ? err.message : '';
  return /unique constraint|UNIQUE constraint/i.test(message);
}

/**
 * There is no seed-script convention in this repo (unlike Roadmap, which
 * needs none — objectives/initiatives are entirely user-created). Studio
 * tasks need at least one project to file into, so `StudioProject` rows are
 * ensured here instead: idempotent, works identically against the Postgres
 * (migration-created table) and SQLite (`synchronize: true`, no migrations
 * run) dev paths.
 *
 * Each default is inserted individually and a unique-key clash on `key` is
 * swallowed rather than checked for up front with a `count()` — multiple
 * instances can run this concurrently (rolling deploy, multi-replica boot)
 * without either crashing or double-seeding; whichever instance's insert
 * wins, the rest just no-op on the constraint. Also the only path that
 * makes `count() === 0` a permanent dead end if a first attempt raced and
 * lost — the old count-then-bulk-save version's single multi-row INSERT
 * failed (and inserted nothing) the moment any one of the three rows
 * conflicted, so a lost race left the table seeded with zero rows forever.
 */
@Injectable()
export class StudioService implements OnModuleInit {
  private readonly logger = new Logger(StudioService.name);

  constructor(
    @InjectRepository(StudioProject)
    private readonly projects: Repository<StudioProject>,
  ) {}

  async onModuleInit() {
    const now = new Date();
    let seeded = 0;
    for (const p of DEFAULT_PROJECTS) {
      try {
        await this.projects.insert(this.projects.create({ ...p, status: 'active', createdAt: now }));
        seeded++;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    if (seeded > 0) this.logger.log(`Seeded ${seeded} default studio project(s)`);
  }

  async listProjects(): Promise<StudioProject[]> {
    return this.projects.find({ order: { key: 'ASC' } });
  }

  async createProject(dto: CreateProjectDto): Promise<StudioProject> {
    const clash = await this.projects.findOne({ where: { key: dto.key } });
    if (clash) throw new ConflictException(`Le code « ${dto.key} » est déjà utilisé`);

    try {
      return await this.projects.save(
        this.projects.create({ name: dto.name, key: dto.key, status: 'active', createdAt: new Date() }),
      );
    } catch (err) {
      // Belt-and-suspenders against a concurrent create racing the check above.
      if (isUniqueViolation(err)) throw new ConflictException(`Le code « ${dto.key} » est déjà utilisé`);
      throw err;
    }
  }
}
