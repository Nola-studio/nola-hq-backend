import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Not, Repository } from 'typeorm';
import {
  RoadmapInitiative,
  type RoadmapInitiativePriority,
  type RoadmapInitiativeScope,
} from '../roadmap/roadmap-initiative.entity';
import { RoadmapService, type RoadmapInitiativeView } from '../roadmap/roadmap.service';
import { TeamMember } from '../team/team-member.entity';
import { StudioNotifyService } from './studio-notify.service';
import { WorkItem, type WorkItemStatus } from '../work-items/work-item.entity';
import { WorkItemsService } from '../work-items/work-items.service';
import {
  STUDIO_PRIORITY_TO_WORK_ITEM_PRIORITY,
  STUDIO_STATUS_TO_WORK_ITEM_STATUS,
  WORK_ITEM_PRIORITY_TO_STUDIO_PRIORITY,
  WORK_ITEM_STATUS_TO_STUDIO_STATUS,
} from '../work-items/work-item-studio-mapping';
import { CreateProjectDto, type StudioProjectPriority } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';
import { ListTasksDto } from './dto/list-tasks.dto';
import { SearchTasksDto } from './dto/search-tasks.dto';
import { ListStudioProjectsDto } from './dto/list-studio-projects.dto';
import type { AddWorkItemCommentDto, ListWorkItemsDto } from '../work-items/dto/work-item.dto';

/**
 * How far back the live board looks for `closed` cards — older ones stay in
 * the archive only (`searchTasks`). Intentionally kept equal to
 * `REOPEN_WINDOW_MS` (`work-items.service.ts`) — an item's reopen countdown
 * and its live-board visibility are meant to end together. If you change
 * one, reconsider the other.
 */
const BOARD_CLOSED_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

/** Studio's `high|medium|low` project priority → `RoadmapInitiative`'s `P0-P3`. */
const PROJECT_PRIORITY_TO_ROADMAP: Record<StudioProjectPriority, RoadmapInitiativePriority> = {
  high: 'P1',
  medium: 'P2',
  low: 'P3',
};

/** `P3` maps back to `low` — `P0` has no Studio-side equivalent to round-trip to, folds into `high`. */
const ROADMAP_PRIORITY_TO_PROJECT: Record<RoadmapInitiativePriority, StudioProjectPriority> = {
  P0: 'high',
  P1: 'high',
  P2: 'medium',
  P3: 'low',
};

/**
 * Thin strangler-fig proxy: keeps `/studio/projects*` and `/studio/tasks*`
 * alive with their original request/response shape for the Studio
 * frontend, while every read/write actually goes through
 * `roadmap_initiatives`/`work_items` — the unified project/task backbone
 * post-merge. `studio_projects`/`studio_tasks` no longer exist.
 *
 * `leadAssigneeEmail` is accepted on the project DTOs for request-shape
 * compatibility but not persisted — `RoadmapInitiative` has no equivalent
 * column. Same for `budget`/`cost`: financials live entirely in
 * `ProjectBudget` (Business module, CDF) now — see that module for the
 * real read/write path.
 */
@Injectable()
export class StudioProjectsProxyService {
  constructor(
    @InjectRepository(RoadmapInitiative)
    private readonly projects: Repository<RoadmapInitiative>,
    @InjectRepository(WorkItem)
    private readonly tasks: Repository<WorkItem>,
    @InjectRepository(TeamMember)
    private readonly team: Repository<TeamMember>,
    private readonly roadmap: RoadmapService,
    private readonly workItems: WorkItemsService,
    private readonly notify: StudioNotifyService,
  ) {}

  // ── projects ─────────────────────────────────────────────────────

  async listProjects(filter: ListStudioProjectsDto = {}) {
    // `title` as a tiebreaker: `keyPrefix` can be null on a row that
    // predates auto-generated identifiers and hasn't been backfilled yet.
    // No `scope` filter by default — the task composer's picker needs both,
    // grouped client-side; the /projects screen passes `scope=project`.
    const where: FindOptionsWhere<RoadmapInitiative> = {};
    if (filter.scope) where.scope = filter.scope;
    const rows = await this.projects.find({ where, order: { keyPrefix: 'ASC', title: 'ASC' } });
    return rows.map((p) => this.toStudioProject(p));
  }

  async findProject(id: string) {
    return this.toStudioProject(await this.findInitiative(id, 'project'));
  }

  async createProject(dto: CreateProjectDto) {
    const created = await this.roadmap.createInitiative(
      {
        title: dto.name,
        summary: dto.description,
        color: dto.color,
        healthStatus: dto.healthStatus,
        type: dto.type,
        priority: dto.priority ? PROJECT_PRIORITY_TO_ROADMAP[dto.priority] : undefined,
        owner: dto.ownerEmail,
        startDate: dto.startDate,
        targetDate: dto.dueDate,
        status: 'idea',
        country: dto.country,
      },
      'project',
    );
    return this.toStudioProject(created);
  }

  async updateProject(id: string, dto: UpdateProjectDto) {
    await this.findInitiative(id, 'project');
    const updated = await this.roadmap.updateInitiative(id, {
      title: dto.name,
      summary: dto.description,
      color: dto.color,
      healthStatus: dto.healthStatus ?? undefined,
      type: dto.type ?? undefined,
      priority: dto.priority ? PROJECT_PRIORITY_TO_ROADMAP[dto.priority] : undefined,
      owner: dto.ownerEmail,
      startDate: dto.startDate ?? undefined,
      targetDate: dto.dueDate ?? undefined,
      country: dto.country,
    });
    return this.toStudioProject(updated);
  }

  /**
   * Blocks rather than warns-and-confirms: an archived project disappears
   * from the task composer's project picker, so archiving one that still
   * has open (non-`done`) work would silently strand those tasks with no
   * way to route new ones alongside them.
   */
  async archiveProject(id: string) {
    const project = await this.findInitiative(id, 'project');
    if (project.archived) return this.toStudioProject(project);

    const openCount = await this.tasks.count({
      where: { projectId: id, status: Not(In(['resolved', 'closed'])) },
    });
    if (openCount > 0) {
      throw new ConflictException(
        `Impossible d'archiver « ${project.keyPrefix ?? project.title} » : ${openCount} tâche(s) encore ouverte(s). Terminez-les ou déplacez-les d'abord.`,
      );
    }

    project.archived = true;
    return this.toStudioProject(await this.projects.save(project));
  }

  async unarchiveProject(id: string) {
    const project = await this.findInitiative(id, 'project');
    project.archived = false;
    return this.toStudioProject(await this.projects.save(project));
  }

  /**
   * `expectedScope` firewalls this proxy from the Roadmap side of the same
   * table: an initiative's id 404s here just as a project's id 404s on
   * `RoadmapService`'s own methods — each screen only ever sees its own rows.
   */
  private async findInitiative(id: string, expectedScope: RoadmapInitiativeScope): Promise<RoadmapInitiative> {
    const project = await this.projects.findOne({ where: { id, scope: expectedScope } });
    if (!project) throw new NotFoundException(`Projet ${id} introuvable`);
    return project;
  }

  private toStudioProject(p: RoadmapInitiative | RoadmapInitiativeView) {
    return {
      id: p.id,
      scope: p.scope,
      name: p.title,
      key: p.keyPrefix,
      description: p.summary,
      status: p.archived ? 'archived' : 'active',
      color: p.color,
      ownerEmail: p.owner,
      type: p.type,
      priority: ROADMAP_PRIORITY_TO_PROJECT[p.priority],
      healthStatus: p.healthStatus,
      country: p.country,
      startDate: p.startDate,
      dueDate: p.targetDate,
      leadAssigneeEmail: null,
      createdAt: p.createdAt,
    };
  }

  // ── tasks ────────────────────────────────────────────────────────

  async findAllTasks(filter: ListTasksDto = {}) {
    const qb = this.tasks.createQueryBuilder('w').leftJoinAndSelect('w.meeting', 'meeting');
    if (filter.category) qb.andWhere('w.category = :category', { category: filter.category });
    if (filter.project) qb.andWhere('w.projectId = :project', { project: filter.project });
    if (filter.status) {
      qb.andWhere('w.status = :status', { status: STUDIO_STATUS_TO_WORK_ITEM_STATUS[filter.status] });
    }
    if (filter.assignee) {
      const assigneeId = await this.resolveAssigneeId(filter.assignee);
      qb.andWhere('w.assignee = :assignee', { assignee: assigneeId ?? '__none__' });
    }
    if (filter.late) {
      qb.andWhere('w.dueDate < :today', { today: new Date().toISOString().slice(0, 10) });
      qb.andWhere('w.status NOT IN (:...doneStatuses)', { doneStatuses: ['resolved', 'closed'] });
    }
    // This is the live board's fetch — dnd-kit's collision detection runs
    // over every draggable/droppable on the board on each drag, so an
    // ever-growing `closed` column degrades drag performance board-wide,
    // not just in that column. Cap it to a recent window; anything older is
    // still reachable via `searchTasks()`, just not part of the live board.
    qb.andWhere('(w.status != :closedStatus OR w.closedAt >= :closedCutoff)', {
      closedStatus: 'closed',
      closedCutoff: new Date(Date.now() - BOARD_CLOSED_WINDOW_MS),
    });
    qb.orderBy('w.status', 'ASC').addOrderBy('w.position', 'ASC').addOrderBy('w.createdAt', 'ASC');

    const rows = await qb.getMany();
    const emailById = await this.emailById();
    return rows.map((r) => this.toStudioTask(r, emailById));
  }

  /**
   * Archive/search view — every task regardless of age or how long it's
   * been closed, paginated. `findAllTasks()` (the live board) only shows
   * `closed` cards from the last `BOARD_CLOSED_WINDOW_MS`; this is where an
   * older one can still be found and opened. Delegates to
   * `WorkItemsService.list()`, which was already paginated/searchable but
   * unused by the board.
   */
  async searchTasks(query: SearchTasksDto) {
    const result = await this.workItems.list({
      page: query.page,
      limit: query.limit,
      q: query.q,
      projectId: query.project,
      status: query.status ? STUDIO_STATUS_TO_WORK_ITEM_STATUS[query.status] : undefined,
    } as ListWorkItemsDto);
    const emailById = await this.emailById();
    return {
      items: result.items.map((r) => this.toStudioTask(r, emailById)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async findOneTask(id: string) {
    const task = await this.findWorkItem(id);
    const emailById = await this.emailById();
    return this.toStudioTask(task, emailById);
  }

  async createTask(dto: CreateTaskDto, createdByEmail: string) {
    const assignee = dto.assigneeEmail ? await this.requireAssigneeId(dto.assigneeEmail) : undefined;
    const created = await this.workItems.create(
      {
        projectId: dto.projectId,
        title: dto.title,
        description: dto.description,
        status: dto.status ? STUDIO_STATUS_TO_WORK_ITEM_STATUS[dto.status] : undefined,
        priority: dto.priority ? STUDIO_PRIORITY_TO_WORK_ITEM_PRIORITY[dto.priority] : undefined,
        assignee,
        dueDate: dto.dueDate,
        meetingId: dto.meetingId,
        category: dto.category,
        hoursSpent: dto.hoursSpent,
        progressPercent: dto.progressPercent,
      },
      createdByEmail,
    );
    const notifyEmail = assignee ? await this.notifyEmailFor(assignee) : null;
    void this.notify.taskCreated({
      identifier: created.reference ?? String(created.id),
      title: created.title,
      assigneeEmail: notifyEmail,
      dueDate: created.dueDate,
    });
    if (notifyEmail) {
      void this.notify.taskAssigned({
        identifier: created.reference ?? String(created.id),
        title: created.title,
        assigneeEmail: notifyEmail,
        dueDate: created.dueDate,
      });
    }
    const emailById = await this.emailById();
    return this.toStudioTask(created, emailById);
  }

  /** Where ticket notifications actually go for a `team_members.id` — falls back to the login `email`. */
  private async notifyEmailFor(memberId: string): Promise<string | null> {
    const member = await this.team.findOne({ where: { id: memberId } });
    return member ? member.notifyEmail || member.email : null;
  }

  async updateTask(id: string, dto: UpdateTaskDto, actor: string) {
    const workItemId = this.parseId(id);
    const previous = dto.assigneeEmail !== undefined ? await this.findWorkItem(id) : null;
    const previousAssigneeEmail =
      previous?.assignee ? (await this.emailById()).get(previous.assignee) ?? null : null;
    const assignee =
      dto.assigneeEmail === undefined
        ? undefined
        : dto.assigneeEmail === null
          ? null
          : await this.requireAssigneeId(dto.assigneeEmail);
    const updated = await this.workItems.update(
      workItemId,
      compact({
        title: dto.title,
        description: dto.description,
        status: dto.status ? STUDIO_STATUS_TO_WORK_ITEM_STATUS[dto.status] : undefined,
        priority: dto.priority ? STUDIO_PRIORITY_TO_WORK_ITEM_PRIORITY[dto.priority] : undefined,
        assignee,
        dueDate: dto.dueDate,
        meetingId: dto.meetingId,
        category: dto.category,
        hoursSpent: dto.hoursSpent,
        progressPercent: dto.progressPercent,
      }),
      actor,
    );
    if (dto.assigneeEmail && dto.assigneeEmail !== previousAssigneeEmail && assignee) {
      const notifyEmail = await this.notifyEmailFor(assignee);
      if (notifyEmail) {
        void this.notify.taskAssigned({
          identifier: updated.reference ?? String(updated.id),
          title: updated.title,
          assigneeEmail: notifyEmail,
          dueDate: updated.dueDate,
        });
      }
    }
    const emailById = await this.emailById();
    return this.toStudioTask(updated, emailById);
  }

  async moveTask(id: string, dto: MoveTaskDto, actor: string) {
    const workItemId = this.parseId(id);
    const status: WorkItemStatus = STUDIO_STATUS_TO_WORK_ITEM_STATUS[dto.status];
    const updated = await this.workItems.move(workItemId, status, dto.position, actor);
    const emailById = await this.emailById();
    return this.toStudioTask(updated, emailById);
  }

  async removeTask(id: string) {
    await this.tasks.delete(this.parseId(id));
  }

  listComments(id: string) {
    return this.workItems.listComments(this.parseId(id));
  }

  addComment(id: string, dto: AddWorkItemCommentDto, actor: string) {
    return this.workItems.addComment(this.parseId(id), dto, actor);
  }

  listAttachments(id: string) {
    return this.workItems.listAttachments(this.parseId(id));
  }

  addAttachment(id: string, file: { originalname: string; mimetype: string; size: number; buffer: Buffer }, actor: string) {
    return this.workItems.addAttachment(this.parseId(id), file, actor);
  }

  getAttachmentFile(id: string, attachmentId: string) {
    return this.workItems.getAttachmentFile(this.parseId(id), attachmentId);
  }

  removeAttachment(id: string, attachmentId: string, actor: string) {
    return this.workItems.removeAttachment(this.parseId(id), attachmentId, actor);
  }

  private async findWorkItem(id: string): Promise<WorkItem> {
    const task = await this.tasks.findOne({ where: { id: this.parseId(id) }, relations: ['meeting'] });
    if (!task) throw new NotFoundException(`Tâche ${id} introuvable`);
    return task;
  }

  private parseId(id: string): number {
    const parsed = Number(id);
    if (!Number.isInteger(parsed)) throw new NotFoundException(`Tâche ${id} introuvable`);
    return parsed;
  }

  private async resolveAssigneeId(email: string): Promise<string | null> {
    const member = await this.team.findOne({ where: { email } });
    return member?.id ?? null;
  }

  private async requireAssigneeId(email: string): Promise<string> {
    const id = await this.resolveAssigneeId(email);
    if (!id) throw new NotFoundException(`Membre d'équipe « ${email} » introuvable`);
    return id;
  }

  private async emailById(): Promise<Map<string, string>> {
    const members = await this.team.find();
    return new Map(members.map((m) => [m.id, m.email]));
  }

  private toStudioTask(item: WorkItem, emailById: Map<string, string>) {
    return {
      id: String(item.id),
      projectId: item.projectId,
      identifier: item.reference,
      title: item.title,
      description: item.description,
      status: WORK_ITEM_STATUS_TO_STUDIO_STATUS[item.status],
      category: item.category,
      assigneeEmail: (item.assignee && emailById.get(item.assignee)) ?? null,
      dueDate: item.dueDate,
      priority: WORK_ITEM_PRIORITY_TO_STUDIO_PRIORITY[item.priority],
      meetingId: item.meetingId,
      meeting: item.meeting ?? null,
      createdByEmail: item.reporter,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      resolvedAt: item.resolvedAt,
      completedAt: item.closedAt,
      position: item.position,
      hoursSpent: item.hoursSpent,
      progressPercent: item.progressPercent,
    };
  }
}

/**
 * Strips `undefined`-valued keys. `WorkItemsService.update()` applies its
 * DTO via `Object.assign(item, dto)`, which — unlike NestJS's normal
 * request-body pipeline, where an omitted JSON field is simply absent from
 * the parsed DTO instance — would otherwise overwrite untouched fields
 * with `undefined` whenever this proxy builds the payload as an object
 * literal (an omitted field there is still an own property, just with
 * value `undefined`). `null` is kept: it's how a field is explicitly
 * cleared.
 */
function compact<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
