import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, LessThan, Not, Repository } from 'typeorm';
import { StudioTask } from './studio-task.entity';
import { StudioProject } from './studio-project.entity';
import { planMove } from './studio.board';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';
import { ListTasksDto } from './dto/list-tasks.dto';

/**
 * Studio's task board. Purely DB-backed, same posture as `RoadmapService`:
 * no NATS, no tenant coupling. Reordering math lives in `studio.board.ts`;
 * this service only fetches and persists.
 */
@Injectable()
export class StudioTasksService {
  constructor(
    @InjectRepository(StudioTask)
    private readonly tasks: Repository<StudioTask>,
    @InjectRepository(StudioProject)
    private readonly projects: Repository<StudioProject>,
  ) {}

  async findAll(filter: ListTasksDto = {}): Promise<StudioTask[]> {
    const where: FindOptionsWhere<StudioTask> = {};
    if (filter.assignee) where.assigneeEmail = filter.assignee;
    if (filter.category) where.category = filter.category;
    if (filter.project) where.projectId = filter.project;
    if (filter.status) where.status = filter.status;
    if (filter.late) {
      where.dueDate = LessThan(new Date().toISOString().slice(0, 10));
      where.status = Not('done');
    }

    return this.tasks.find({
      where,
      relations: ['meeting'],
      order: { status: 'ASC', position: 'ASC', createdAt: 'ASC' },
    });
  }

  async findOne(id: string): Promise<StudioTask> {
    const task = await this.tasks.findOne({ where: { id }, relations: ['meeting'] });
    if (!task) throw new NotFoundException(`Tâche ${id} introuvable`);
    return task;
  }

  /**
   * `identifier` (`YEK-42`) is the project's key plus the next free
   * sequence number, computed from the existing tasks rather than a
   * Postgres advisory lock (unlike nola-ops's Prisma version) — this
   * codebase's SQLite dev path has no equivalent primitive, and Studio's
   * write volume (an internal team tool) makes the race window academic.
   */
  async create(dto: CreateTaskDto, createdByEmail: string): Promise<StudioTask> {
    const project = await this.projects.findOne({ where: { id: dto.projectId } });
    if (!project) throw new NotFoundException(`Projet ${dto.projectId} introuvable`);

    const siblings = await this.tasks.find({
      where: { projectId: dto.projectId },
      select: ['identifier'],
    });
    const nextNumber =
      siblings.reduce((max, t) => {
        const suffix = Number(t.identifier.slice(project.key.length + 1));
        return Number.isSafeInteger(suffix) ? Math.max(max, suffix) : max;
      }, 0) + 1;

    const status = dto.status ?? 'backlog';
    const now = new Date();
    const task = this.tasks.create({
      projectId: dto.projectId,
      identifier: `${project.key}-${nextNumber}`,
      title: dto.title,
      description: dto.description ?? null,
      status,
      category: dto.category,
      assigneeEmail: dto.assigneeEmail ?? null,
      dueDate: dto.dueDate ?? null,
      priority: dto.priority ?? 'none',
      meetingId: dto.meetingId ?? null,
      createdByEmail,
      completedAt: status === 'done' ? now : null,
      // Lands at the bottom of its column — a new card never jumps the queue.
      position: dto.position ?? (await this.tasks.count({ where: { status } })),
      createdAt: now,
      updatedAt: now,
    });
    return this.tasks.save(task);
  }

  async update(id: string, dto: UpdateTaskDto): Promise<StudioTask> {
    const task = await this.findOne(id);

    if (dto.title !== undefined) task.title = dto.title;
    if (dto.description !== undefined) task.description = dto.description ?? null;
    if (dto.status !== undefined) {
      task.status = dto.status;
      task.completedAt = dto.status === 'done' ? (task.completedAt ?? new Date()) : null;
    }
    if (dto.category !== undefined) task.category = dto.category;
    if (dto.assigneeEmail !== undefined) task.assigneeEmail = dto.assigneeEmail ?? null;
    if (dto.dueDate !== undefined) task.dueDate = dto.dueDate ?? null;
    if (dto.priority !== undefined) task.priority = dto.priority;
    if (dto.meetingId !== undefined) task.meetingId = dto.meetingId ?? null;
    if (dto.position !== undefined) task.position = dto.position;
    task.updatedAt = new Date();

    return this.tasks.save(task);
  }

  /**
   * Drag & drop on the board: places the task at `position` in the `status`
   * column and re-densifies both the target and (on a cross-column move)
   * the source column. Every touched row is saved in one `save([])`, which
   * TypeORM wraps in a single transaction.
   */
  async move(id: string, dto: MoveTaskDto): Promise<StudioTask> {
    const task = await this.findOne(id);

    // Only the two columns involved can change — no need to load the board.
    const columns = await this.tasks.find({
      where: { status: In([task.status, dto.status]) },
    });
    const placements = planMove(columns, id, dto.status, dto.position ?? 0);

    if (placements.length > 0) {
      const now = new Date();
      const byId = new Map(columns.map((t) => [t.id, t]));
      const touched: StudioTask[] = [];
      for (const placement of placements) {
        const row = byId.get(placement.id);
        if (!row) continue;
        const enteringDone = placement.status === 'done' && row.status !== 'done';
        const leavingDone = placement.status !== 'done' && row.status === 'done';
        row.status = placement.status;
        row.position = placement.position;
        if (enteringDone) row.completedAt = row.completedAt ?? now;
        if (leavingDone) row.completedAt = null;
        row.updatedAt = now;
        touched.push(row);
      }
      await this.tasks.save(touched);
    }

    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const task = await this.findOne(id);
    await this.tasks.remove(task);
  }
}
