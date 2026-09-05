import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Not, Repository } from 'typeorm';
import {
  RoadmapInitiative,
  type RoadmapInitiativePriority,
  type RoadmapInitiativeScope,
} from '../roadmap/roadmap-initiative.entity';
import { RoadmapMilestone } from '../roadmap/roadmap-milestone.entity';
import { RoadmapService, type RoadmapInitiativeView } from '../roadmap/roadmap.service';
import { Domain } from '../domains/domain.entity';
import { TeamMember } from '../team/team-member.entity';
import { StudioNotifyService } from './studio-notify.service';
import { BusinessUnitResolverService } from '../company/business-unit-resolver.service';
import { WorkItem, type WorkItemStatus } from '../work-items/work-item.entity';
import { WorkItemsService } from '../work-items/work-items.service';
import { ProjectRisk } from '../work-items/project-risk.entity';
import { WorkSprint } from '../work-items/work-sprint.entity';
import { ProjectBudget } from '../business/project-budget.entity';
import { ProjectTimeEntry } from '../business/project-time-entry.entity';
import { BusinessExpense } from '../business/business-expense.entity';
import { BusinessInvoice } from '../business/business-invoice.entity';
import { BusinessOpportunity } from '../business/business-opportunity.entity';
import { BusinessContract } from '../business/business-contract.entity';
import { BusinessQuote } from '../business/business-quote.entity';
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

/** Libellés résolus une fois par requête, partagés par toutes les lignes. */
interface TaskContext {
  domains: Map<string, { code: string; name: string }>;
  parents: Map<number, { id: string; identifier: string | null; title: string }>;
}

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
    @InjectRepository(RoadmapMilestone)
    private readonly milestones: Repository<RoadmapMilestone>,
    @InjectRepository(ProjectRisk)
    private readonly projectRisks: Repository<ProjectRisk>,
    @InjectRepository(WorkSprint)
    private readonly workSprints: Repository<WorkSprint>,
    @InjectRepository(ProjectBudget)
    private readonly projectBudgets: Repository<ProjectBudget>,
    @InjectRepository(ProjectTimeEntry)
    private readonly projectTimeEntries: Repository<ProjectTimeEntry>,
    @InjectRepository(BusinessExpense)
    private readonly businessExpenses: Repository<BusinessExpense>,
    @InjectRepository(BusinessInvoice)
    private readonly businessInvoices: Repository<BusinessInvoice>,
    @InjectRepository(BusinessOpportunity)
    private readonly businessOpportunities: Repository<BusinessOpportunity>,
    @InjectRepository(BusinessContract)
    private readonly businessContracts: Repository<BusinessContract>,
    @InjectRepository(BusinessQuote)
    private readonly businessQuotes: Repository<BusinessQuote>,
    private readonly roadmap: RoadmapService,
    private readonly workItems: WorkItemsService,
    private readonly notify: StudioNotifyService,
    private readonly businessUnits: BusinessUnitResolverService,
    // Injecté en dernier : les specs qui construisent ce service
    // positionnellement continuent de fonctionner, et seul l'enrichissement
    // domaine/epic en a besoin.
    @InjectRepository(Domain)
    private readonly domains: Repository<Domain>,
  ) {}

  // ── projects ─────────────────────────────────────────────────────

  async listProjects(filter: ListStudioProjectsDto = {}, roles?: string[]) {
    // `title` as a tiebreaker: `keyPrefix` can be null on a row that
    // predates auto-generated identifiers and hasn't been backfilled yet.
    // No `scope` filter by default — the task composer's picker needs both,
    // grouped client-side; the /projects screen passes `scope=project`.
    const allowedUnitIds = await this.businessUnits.resolveAllowedUnits(roles);
    if (allowedUnitIds.length === 0) {
      return [];
    }
    const where: FindOptionsWhere<RoadmapInitiative> = {
      businessUnitId: In(allowedUnitIds),
    };
    if (filter.scope) where.scope = filter.scope;
    const rows = await this.projects.find({
      where,
      order: { keyPrefix: 'ASC', title: 'ASC' },
      relations: ['businessUnit'],
    });
    return rows.map((p) => this.toStudioProject(p));
  }

  async findProject(id: string, roles?: string[]) {
    return this.toStudioProject(await this.findInitiative(id, 'project', roles));
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
        businessUnitCode: dto.businessUnitCode,
      },
      'project',
    );
    return this.toStudioProject(created);
  }

  async updateProject(id: string, dto: UpdateProjectDto, roles?: string[]) {
    await this.findInitiative(id, 'project', roles);
    const updated = await this.roadmap.updateInitiative(
      id,
      {
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
      },
      roles,
      'project',
    );
    return this.toStudioProject(updated);
  }

  /**
   * Blocks rather than warns-and-confirms: an archived project disappears
   * from the task composer's project picker, so archiving one that still
   * has open (non-`done`) work would silently strand those tasks with no
   * way to route new ones alongside them.
   */
  async archiveProject(id: string, roles?: string[]) {
    const project = await this.findInitiative(id, 'project', roles);
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

  async unarchiveProject(id: string, roles?: string[]) {
    const project = await this.findInitiative(id, 'project', roles);
    project.archived = false;
    return this.toStudioProject(await this.projects.save(project));
  }

  /**
   * Hard delete only when nothing references the project — 6 of its FKs are
   * `CASCADE` and 6 are `SET NULL`, so the database would happily delete
   * through or orphan those rows silently if we didn't check first. Checked
   * inline against all 12 relations rather than behind a generic
   * "assert no dependents" helper — this shape is specific to
   * `RoadmapInitiative`'s FK graph, nothing else in the schema looks like
   * this. Anything found blocks with a 409 naming what and how many;
   * archiving remains the only path once a project has real activity on it.
   */
  async removeProject(id: string, roles?: string[]) {
    const project = await this.findInitiative(id, 'project', roles);

    const [
      milestoneCount,
      riskCount,
      budgetCount,
      expenseCount,
      invoiceCount,
      timeEntryCount,
      sprintCount,
      taskCount,
      opportunityCount,
      contractCount,
      quoteCount,
    ] = await Promise.all([
      this.milestones.count({ where: { initiativeId: id } }),
      this.projectRisks.count({ where: { projectId: id } }),
      this.projectBudgets.count({ where: { projectId: id } }),
      this.businessExpenses.count({ where: { projectId: id } }),
      this.businessInvoices.count({ where: { projectId: id } }),
      this.projectTimeEntries.count({ where: { projectId: id } }),
      this.workSprints.count({ where: { projectId: id } }),
      this.tasks.count({ where: { projectId: id } }),
      this.businessOpportunities.count({ where: { projectId: id } }),
      this.businessContracts.count({ where: { projectId: id } }),
      this.businessQuotes.count({ where: { projectId: id } }),
    ]);

    const blockers: string[] = [];
    if (milestoneCount > 0) blockers.push(`${milestoneCount} jalon(s)`);
    if (riskCount > 0) blockers.push(`${riskCount} risque(s)`);
    if (budgetCount > 0) blockers.push(`${budgetCount} budget`);
    if (expenseCount > 0) blockers.push(`${expenseCount} dépense(s)`);
    if (invoiceCount > 0) blockers.push(`${invoiceCount} facture(s)`);
    if (timeEntryCount > 0) blockers.push(`${timeEntryCount} entrée(s) de temps`);
    if (sprintCount > 0) blockers.push(`${sprintCount} sprint(s)`);
    if (taskCount > 0) blockers.push(`${taskCount} tâche(s)`);
    if (opportunityCount > 0) blockers.push(`${opportunityCount} opportunité(s)`);
    if (contractCount > 0) blockers.push(`${contractCount} contrat(s)`);
    if (quoteCount > 0) blockers.push(`${quoteCount} devis`);
    // No separate request count: a filed need *is* a work item since REQ-01,
    // so `taskCount` already covers what `studio_requests` used to hold.

    if (blockers.length > 0) {
      throw new ConflictException(
        `Impossible de supprimer « ${project.keyPrefix ?? project.title} » : ${blockers.join(', ')}. Archivez-le à la place.`,
      );
    }

    await this.projects.remove(project);
  }

  /**
   * `expectedScope` firewalls this proxy from the Roadmap side of the same
   * table: an initiative's id 404s here just as a project's id 404s on
   * `RoadmapService`'s own methods — each screen only ever sees its own rows.
   */
  private async findInitiative(
    id: string,
    expectedScope: RoadmapInitiativeScope,
    roles?: string[],
  ): Promise<RoadmapInitiative> {
    const allowedUnitIds = await this.businessUnits.resolveAllowedUnits(roles);
    if (allowedUnitIds.length === 0) {
      throw new NotFoundException(`Projet ${id} introuvable`);
    }
    const project = await this.projects.findOne({
      where: { id, scope: expectedScope, businessUnitId: In(allowedUnitIds) },
      relations: ['businessUnit'],
    });
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
      businessUnit: p.businessUnit ? { code: p.businessUnit.code, name: p.businessUnit.name } : undefined,
      isInternal: p.isInternal,
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
    const [emailById, context] = await Promise.all([this.emailById(), this.taskContext(rows)]);
    return rows.map((r) => this.toStudioTask(r, emailById, context));
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
    const [emailById, context] = await Promise.all([this.emailById(), this.taskContext(result.items)]);
    return {
      items: result.items.map((r) => this.toStudioTask(r, emailById, context)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async findOneTask(id: string) {
    const task = await this.findWorkItem(id);
    const [emailById, context] = await Promise.all([this.emailById(), this.taskContext([task])]);
    return this.toStudioTask(task, emailById, context);
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
    const previous =
      dto.assigneeEmail !== undefined || dto.projectId !== undefined
        ? await this.findWorkItem(id)
        : null;
    const previousAssigneeEmail =
      previous?.assignee ? (await this.emailById()).get(previous.assignee) ?? null : null;
    /**
     * Un sprint appartient à un projet. Rattacher le ticket à un autre projet
     * sans le sortir de son sprint ferait refuser l'écriture pour
     * incohérence — et le message parlerait du sprint, pas du projet, là où
     * l'utilisateur croit avoir fait un geste simple. On l'en sort donc, et
     * l'écran le dit avant le clic.
     */
    const leavesSprint =
      dto.projectId !== undefined &&
      previous !== null &&
      previous.sprintId !== null &&
      previous.projectId !== dto.projectId;
    const assignee =
      dto.assigneeEmail === undefined
        ? undefined
        : dto.assigneeEmail === null
          ? null
          : await this.requireAssigneeId(dto.assigneeEmail);
    const updated = await this.workItems.update(
      workItemId,
      compact({
        projectId: dto.projectId,
        sprintId: leavesSprint ? null : undefined,
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

  /**
   * Ce qu'il faut pour situer un ticket dans la hiérarchie : son domaine et
   * son epic parent.
   *
   * Chargé une fois par requête et passé aux lignes plutôt que résolu ticket
   * par ticket — un backlog de cent items ferait deux cents requêtes pour
   * afficher deux libellés.
   */
  private async taskContext(rows: WorkItem[]): Promise<TaskContext> {
    const domainIds = [...new Set(rows.map((r) => r.domainId).filter((id): id is string => !!id))];
    const parentIds = [...new Set(rows.map((r) => r.parentId).filter((id): id is number => !!id))];

    const [domains, parents] = await Promise.all([
      domainIds.length ? this.domains.find({ where: { id: In(domainIds) } }) : Promise.resolve([]),
      parentIds.length
        ? this.tasks.find({ where: { id: In(parentIds) }, select: { id: true, reference: true, title: true } })
        : Promise.resolve([]),
    ]);

    return {
      domains: new Map(domains.map((d) => [d.id, { code: d.code, name: d.name }])),
      parents: new Map(
        parents.map((p) => [p.id, { id: String(p.id), identifier: p.reference, title: p.title }]),
      ),
    };
  }

  private toStudioTask(item: WorkItem, emailById: Map<string, string>, context?: TaskContext) {
    return {
      id: String(item.id),
      projectId: item.projectId,
      identifier: item.reference,
      title: item.title,
      description: item.description,
      status: WORK_ITEM_STATUS_TO_STUDIO_STATUS[item.status],
      /**
       * Le type du référentiel (epic, story, spike…), distinct de `category`
       * qui classe le travail par nature métier. Les deux coexistent : l'un
       * dit ce qu'est l'objet, l'autre à quoi il sert.
       */
      type: item.type,
      /** Backend, frontend, les deux — dit par le document, jamais deviné. */
      surface: item.surface,
      /** Rattachement fonctionnel (§4A) — `null` tant que rien n'a classé l'item. */
      domain: (item.domainId && context?.domains.get(item.domainId)) || null,
      /** L'epic dont ce ticket dépend, quand il en a un. */
      parent: (item.parentId && context?.parents.get(item.parentId)) || null,
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
