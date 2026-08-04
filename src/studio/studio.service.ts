import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudioProject } from './studio-project.entity';

/** The fixed set of workstreams tasks are filed under. */
const DEFAULT_PROJECTS: Array<Pick<StudioProject, 'name' | 'key'>> = [
  { name: 'Yeko', key: 'YEK' },
  { name: 'Nola', key: 'NOLA' },
  { name: 'Studio', key: 'STU' },
];

/**
 * There is no seed-script convention in this repo (unlike Roadmap, which
 * needs none — objectives/initiatives are entirely user-created). Studio
 * tasks need at least one project to file into, so `StudioProject` rows are
 * ensured here instead: idempotent, works identically against the Postgres
 * (migration-created table) and SQLite (`synchronize: true`, no migrations
 * run) dev paths.
 */
@Injectable()
export class StudioService implements OnModuleInit {
  private readonly logger = new Logger(StudioService.name);

  constructor(
    @InjectRepository(StudioProject)
    private readonly projects: Repository<StudioProject>,
  ) {}

  async onModuleInit() {
    const count = await this.projects.count();
    if (count > 0) return;

    const now = new Date();
    await this.projects.save(
      DEFAULT_PROJECTS.map((p) =>
        this.projects.create({ ...p, status: 'active', createdAt: now }),
      ),
    );
    this.logger.log(`Seeded ${DEFAULT_PROJECTS.length} default studio projects`);
  }

  async listProjects(): Promise<StudioProject[]> {
    return this.projects.find({ order: { key: 'ASC' } });
  }
}
