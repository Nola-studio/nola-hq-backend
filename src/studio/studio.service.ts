import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { StudioProject } from './studio-project.entity';
import { StudioTask } from './studio-task.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

/** Postgres `23505` / SQLite `SQLITE_CONSTRAINT` — a unique-key clash on `key`. */
function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string } | undefined)?.code;
  if (code === '23505' || code === 'SQLITE_CONSTRAINT') return true;
  const message = err instanceof Error ? err.message : '';
  return /unique constraint|UNIQUE constraint/i.test(message);
}

/**
 * Studio projects are fully user-managed — no seed, no fixed set. There is
 * deliberately no delete: `key` is embedded in every task `identifier` filed
 * under it (`YEK-1`, `YEK-2`, …) for the life of that task, so retiring a
 * project means archiving it, not removing the row.
 */
@Injectable()
export class StudioService {
  constructor(
    @InjectRepository(StudioProject)
    private readonly projects: Repository<StudioProject>,
    @InjectRepository(StudioTask)
    private readonly tasks: Repository<StudioTask>,
  ) {}

  async listProjects(): Promise<StudioProject[]> {
    return this.projects.find({ order: { key: 'ASC' } });
  }

  async findProject(id: string): Promise<StudioProject> {
    const project = await this.projects.findOne({ where: { id } });
    if (!project) throw new NotFoundException(`Projet ${id} introuvable`);
    return project;
  }

  async createProject(dto: CreateProjectDto): Promise<StudioProject> {
    const clash = await this.projects.findOne({ where: { key: dto.key } });
    if (clash) throw new ConflictException(`Le code « ${dto.key} » est déjà utilisé`);

    try {
      return await this.projects.save(
        this.projects.create({
          name: dto.name,
          key: dto.key,
          description: dto.description ?? null,
          color: dto.color,
          ownerEmail: dto.ownerEmail ?? null,
          status: 'active',
          type: dto.type ?? null,
          priority: dto.priority ?? null,
          healthStatus: dto.healthStatus ?? null,
          budget: dto.budget ?? null,
          cost: dto.cost ?? null,
          startDate: dto.startDate ?? null,
          dueDate: dto.dueDate ?? null,
          leadAssigneeEmail: dto.leadAssigneeEmail ?? null,
          createdAt: new Date(),
        }),
      );
    } catch (err) {
      // Belt-and-suspenders against a concurrent create racing the check above.
      if (isUniqueViolation(err)) throw new ConflictException(`Le code « ${dto.key} » est déjà utilisé`);
      throw err;
    }
  }

  async updateProject(id: string, dto: UpdateProjectDto): Promise<StudioProject> {
    const project = await this.findProject(id);
    if (dto.name !== undefined) project.name = dto.name;
    if (dto.description !== undefined) project.description = dto.description ?? null;
    if (dto.color !== undefined) project.color = dto.color;
    if (dto.ownerEmail !== undefined) project.ownerEmail = dto.ownerEmail ?? null;
    if (dto.type !== undefined) project.type = dto.type;
    if (dto.priority !== undefined) project.priority = dto.priority;
    if (dto.healthStatus !== undefined) project.healthStatus = dto.healthStatus;
    if (dto.budget !== undefined) project.budget = dto.budget;
    if (dto.cost !== undefined) project.cost = dto.cost;
    if (dto.startDate !== undefined) project.startDate = dto.startDate;
    if (dto.dueDate !== undefined) project.dueDate = dto.dueDate;
    if (dto.leadAssigneeEmail !== undefined) project.leadAssigneeEmail = dto.leadAssigneeEmail;
    return this.projects.save(project);
  }

  /**
   * Blocks rather than warns-and-confirms: an archived project disappears
   * from the task composer's project picker, so archiving one that still
   * has open (non-`done`) work would silently strand those tasks with no
   * way to route new ones alongside them. Move or finish the open tasks
   * first (or archive anyway once they're done).
   */
  async archiveProject(id: string): Promise<StudioProject> {
    const project = await this.findProject(id);
    if (project.status === 'archived') return project;

    const openCount = await this.tasks.count({
      where: { projectId: id, status: Not('done') },
    });
    if (openCount > 0) {
      throw new ConflictException(
        `Impossible d'archiver « ${project.key} » : ${openCount} tâche(s) encore ouverte(s). Terminez-les ou déplacez-les d'abord.`,
      );
    }

    project.status = 'archived';
    return this.projects.save(project);
  }

  async unarchiveProject(id: string): Promise<StudioProject> {
    const project = await this.findProject(id);
    project.status = 'active';
    return this.projects.save(project);
  }
}
