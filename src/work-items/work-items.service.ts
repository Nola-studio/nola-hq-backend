import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Not, Repository } from 'typeorm';
import { PaginationDto, type PaginatedResult } from '../common/dto/pagination.dto';
import { Domain } from '../domains/domain.entity';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { slugifyProjectName, taskReference } from '../roadmap/roadmap-identifier';
import { TeamMember } from '../team/team-member.entity';
import { PushService } from '../push/push.service';
import { checkParent, lineageOf, type HierarchyNode } from './work-item-hierarchy';
import { WorkItemAttachment } from './work-item-attachment.entity';
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENTS_PER_TICKET,
  MAX_ATTACHMENT_BYTES,
  assertAttachmentsDirWritable,
  deleteAttachmentFile,
  readAttachmentFile,
  saveAttachmentFile,
} from './work-item-attachment-storage';
import { WorkItemComment } from './work-item-comment.entity';
import { WorkItemEvent, type WorkItemEventAction } from './work-item-event.entity';
import { WorkItemSubtask } from './work-item-subtask.entity';
import { WorkPlanningService } from './work-planning.service';
import { planMove } from './work-items.board';
import {
  WORK_ITEM_STATUSES,
  WorkItem,
  isDoneStatus,
  type WorkItemStatus,
} from './work-item.entity';
import {
  CreateWorkItemDto,
  ListWorkItemsDto,
  UpdateWorkItemDto,
  AddWorkItemCommentDto,
  AddWorkItemSubtaskDto,
  UpdateWorkItemSubtaskDto,
  CaptureWorkItemDto,
} from './dto/work-item.dto';

const STATUS_LABELS: Record<WorkItemStatus, string> = {
  triage: 'Boîte de réception',
  todo: 'À faire',
  in_progress: 'En cours',
  blocked: 'Bloqué',
  review: 'En revue',
  resolved: 'Résolu',
  closed: 'Fermé',
};

/** Board columns — every status except the `triage` inbox. See `board()`. */
const BOARD_STATUSES = WORK_ITEM_STATUSES.filter((status) => status !== 'triage');

const STATUS_TONES: Record<WorkItemStatus, string> = {
  triage: '#8A5C12',
  todo: '#64748B',
  in_progress: '#4F46E5',
  blocked: '#DC2626',
  review: '#D97706',
  resolved: '#16A34A',
  closed: '#94A3B8',
};

/**
 * How long a resolved ticket stays reopenable before the daily job closes
 * it. Intentionally kept equal to `BOARD_CLOSED_WINDOW_MS`
 * (`studio-projects-proxy.service.ts`) — an item's reopen countdown and its
 * live-board visibility are meant to end together. If you change one,
 * reconsider the other.
 */
const REOPEN_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

@Injectable()
export class WorkItemsService implements OnModuleInit {
  private readonly logger = new Logger(WorkItemsService.name);

  constructor(
    @InjectRepository(WorkItem)
    private readonly repo: Repository<WorkItem>,
    @InjectRepository(RoadmapInitiative)
    private readonly projects: Repository<RoadmapInitiative>,
    @InjectRepository(WorkItemComment)
    private readonly comments: Repository<WorkItemComment>,
    @InjectRepository(WorkItemSubtask)
    private readonly subtasks: Repository<WorkItemSubtask>,
    @InjectRepository(WorkItemEvent)
    private readonly events: Repository<WorkItemEvent>,
    @InjectRepository(WorkItemAttachment)
    private readonly attachments: Repository<WorkItemAttachment>,
    @InjectRepository(TeamMember)
    private readonly team: Repository<TeamMember>,
    private readonly push: PushService,
    private readonly planning: WorkPlanningService,
    // Injected last on purpose: the specs that build this service positionally
    // keep working, and only `inbox()` needs it.
    @InjectRepository(Domain)
    private readonly domains: Repository<Domain>,
  ) {}

  /** Fails boot rather than letting a bad `ATTACHMENTS_DIR` surface as a 500 on someone's first upload. */
  async onModuleInit(): Promise<void> {
    await assertAttachmentsDirWritable();
    this.logger.log('Attachments directory is writable.');
  }

  async list(query: ListWorkItemsDto): Promise<PaginatedResult<WorkItem>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 100;
    const qb = this.repo.createQueryBuilder('w');
    if (query.projectId) qb.andWhere('w.projectId = :projectId', { projectId: query.projectId });
    if (query.sprintId) qb.andWhere('w.sprintId = :sprintId', { sprintId: query.sprintId });
    if (query.status) qb.andWhere('w.status = :status', { status: query.status });
    if (query.priority) qb.andWhere('w.priority = :priority', { priority: query.priority });
    if (query.type) qb.andWhere('w.type = :type', { type: query.type });
    if (query.sourceKind) qb.andWhere('w.sourceKind = :sourceKind', { sourceKind: query.sourceKind });
    if (query.assignee) qb.andWhere('w.assignee = :assignee', { assignee: query.assignee });
    if (query.q) {
      qb.andWhere('(LOWER(w.title) LIKE :q OR LOWER(w.description) LIKE :q OR LOWER(w.reference) LIKE :q)', {
        q: `%${query.q.toLowerCase()}%`,
      });
    }
    qb.orderBy('w.status', 'ASC').addOrderBy('w.position', 'ASC').addOrderBy('w.createdAt', 'DESC');
    const total = await qb.getCount();
    const items = await qb.skip((page - 1) * limit).take(limit).getMany();
    return { items, total, page, limit };
  }

  /**
   * The Kanban keeps its six columns. `triage` is an inbox, not a stage of
   * work: a manifest can drop dozens of proposals into it at once, and they
   * would swamp the board before anyone accepted them. It is reachable by
   * filtering on the status explicitly.
   */
  async board(query: ListWorkItemsDto) {
    const result = await this.list({ ...query, page: 1, limit: 200 } as ListWorkItemsDto);
    /**
     * Les epics ne sont pas des cartes. Un référentiel en apporte des
     * dizaines, et un epic ne se prend pas en main dans la journée : sa place
     * est dans la vue Epics, où on lit l'avancement de ce qu'il porte. Le
     * tableau garde le travail qu'on déplace vraiment.
     */
    const cards = result.items.filter((item) => item.type !== 'epic');
    return BOARD_STATUSES.map((status) => ({
      id: status,
      label: STATUS_LABELS[status],
      tone: STATUS_TONES[status],
      items: cards.filter((item) => item.status === status),
    }));
  }

  /**
   * La boîte de réception : ce qu'une machine propose, groupé par domaine.
   *
   * Un manifest dépose des dizaines d'items d'un coup. Les lire dans une
   * liste à plat, dans l'ordre du document, ne dit pas à un humain ce qu'il
   * accepte — le domaine, si. Chaque groupe porte donc son compte, et les
   * epics viennent avant leurs stories pour qu'accepter un epic sans ses
   * stories reste une décision visible plutôt qu'un accident de tri.
   */
  /**
   * Range des items sous leur domaine.
   *
   * `ZZ` n'est pas un code de domaine : c'est la clé qui pousse les non
   * classés en fin de liste, là où on les cherche. Le tri alphabétique sur
   * les codes fait le reste — D01 avant D02, et les orphelins après D12.
   */
  private async groupByDomain<T>(
    items: (WorkItem & { domainId: string | null })[],
    shape: (item: WorkItem) => T,
  ): Promise<{ code: string; name: string; items: T[] }[]> {
    const domains = new Map((await this.domains.find({ order: { position: 'ASC' } })).map((d) => [d.id, d]));
    const groups = new Map<string, { code: string; name: string; items: T[] }>();

    for (const item of items) {
      const domain = item.domainId ? domains.get(item.domainId) : undefined;
      const key = domain?.code ?? 'ZZ';
      let group = groups.get(key);
      if (!group) {
        group = { code: key, name: domain?.name ?? 'Sans domaine', items: [] };
        groups.set(key, group);
      }
      group.items.push(shape(item));
    }

    return [...groups.values()].sort((a, b) => a.code.localeCompare(b.code));
  }

  async inbox() {
    const items = await this.repo.find({
      where: { status: 'triage' },
      order: { domainId: 'ASC', parentId: 'ASC', id: 'ASC' },
    });
    return {
      total: items.length,
      groups: await this.groupByDomain(items, (item) => item),
    };
  }

  /**
   * La vue Epics : le pilotage du référentiel, par domaine.
   *
   * Un epic n'a pas sa place dans une colonne de Kanban — il couvre un
   * trimestre et n'est terminé que quand ses enfants le sont, donc le glisser
   * vers « En cours » n'affirme rien de vrai. Il lui faut sa propre vue, où ce
   * qui compte est l'avancement de ce qu'il porte, pas sa position dans une
   * file.
   *
   * Les epics encore en `triage` restent dans la boîte de réception : ils ne
   * sont pas du backlog tant que personne ne les a acceptés.
   */
  async epics() {
    const epics = await this.repo.find({
      where: { type: 'epic', status: Not('triage' as WorkItemStatus) },
      order: { domainId: 'ASC', priority: 'ASC', id: 'ASC' },
    });

    // Deux requêtes quel que soit le nombre d'epics : les enfants sont
    // chargés en une fois et répartis en mémoire.
    const children = epics.length
      ? await this.repo.find({
          where: { parentId: In(epics.map((e) => e.id)) },
          order: { position: 'ASC', id: 'ASC' },
        })
      : [];

    const childrenOf = new Map<number, WorkItem[]>();
    for (const child of children) {
      const bucket = childrenOf.get(child.parentId!);
      if (bucket) bucket.push(child);
      else childrenOf.set(child.parentId!, [child]);
    }

    const groups = await this.groupByDomain(epics, (epic) => {
      const own = childrenOf.get(epic.id) ?? [];
      return {
        ...epic,
        children: own,
        /**
         * L'avancement se lit sur les enfants, pas sur le statut de l'epic.
         * Un epic sans enfant n'a pas d'avancement à montrer — 0/0 vaut
         * « rien de découpé », pas « rien de fait ».
         */
        progress: {
          total: own.length,
          done: own.filter((c) => isDoneStatus(c.status)).length,
          inProgress: own.filter((c) => c.status === 'in_progress' || c.status === 'review').length,
        },
      };
    });

    return { total: epics.length, groups };
  }

  /**
   * Accepte un lot de propositions : `triage` → `todo`.
   *
   * EXE-05 demande qu'aucune mutation du backlog canonique n'ait lieu sans
   * décision humaine — mais une décision, pas cent. C'est le geste que la
   * boîte de réception existe pour rendre possible.
   *
   * Seuls les items réellement en `triage` bougent. Passer un ticket déjà
   * accepté de `in_progress` à `todo` parce qu'il figurait dans une sélection
   * périmée effacerait du travail : ces ids sont rapportés comme ignorés.
   */
  async acceptTriage(ids: number[], actor: string) {
    return this.decideTriage(ids, actor, 'accept');
  }

  /**
   * Écarte un lot de propositions : `triage` → `closed`.
   *
   * Rien n'est supprimé. La provenance d'un item écarté reste lisible, et une
   * version ultérieure du référentiel le retrouvera par sa clé stable au lieu
   * d'en recréer un double.
   */
  async dismissTriage(ids: number[], actor: string) {
    return this.decideTriage(ids, actor, 'dismiss');
  }

  private async decideTriage(ids: number[], actor: string, decision: 'accept' | 'dismiss') {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return { accepted: [], dismissed: [], skipped: [] as { id: number; reason: string }[] };

    const found = await this.repo.find({ where: { id: In(unique) } });
    const byId = new Map(found.map((item) => [item.id, item]));

    const moved: number[] = [];
    const skipped: { id: number; reason: string }[] = [];
    const now = new Date();

    for (const id of unique) {
      const item = byId.get(id);
      if (!item) {
        skipped.push({ id, reason: 'Ticket introuvable.' });
        continue;
      }
      if (item.status !== 'triage') {
        skipped.push({ id, reason: `Déjà sorti de la boîte de réception (« ${item.status} »).` });
        continue;
      }
      moved.push(id);
    }

    if (moved.length > 0) {
      /**
       * Un seul UPDATE, pas un par ticket. `save()` sur un tableau émet une
       * requête par entité — cent allers-retours sur une même connexion pour
       * une décision que l'utilisateur a prise en un geste, et un
       * avertissement du pilote `pg` au passage.
       */
      await this.repo.update(
        { id: In(moved) },
        {
          status: decision === 'accept' ? 'todo' : 'closed',
          approvedBy: actor,
          updatedAt: now,
          ...(decision === 'dismiss' ? { closedAt: now } : {}),
        },
      );
      await this.events.save(
        moved.map((workItemId) =>
          this.events.create({
            workItemId,
            actor,
            action: decision === 'accept' ? 'accepted' : 'dismissed',
            meta: { from: 'triage', batch: moved.length },
            createdAt: now,
          }),
        ),
      );
    }

    return {
      accepted: decision === 'accept' ? moved : [],
      dismissed: decision === 'dismiss' ? moved : [],
      skipped,
    };
  }

  /**
   * Applique un rattachement après l'avoir vérifié.
   *
   * La vérification a besoin de remonter la chaîne des parents, donc elle
   * charge les ancêtres un par un plutôt que tout le backlog : une chaîne fait
   * trois niveaux dans la taxonomie, et lire cent mille tickets pour en
   * valider un serait absurde.
   */
  private async assertParentAllowed(child: WorkItem, parentId: number | null): Promise<void> {
    if (parentId === null) return;
    const parent = await this.repo.findOne({ where: { id: parentId } });
    if (!parent) throw new NotFoundException(`Élément parent ${parentId} introuvable`);

    const cache = new Map<number, HierarchyNode>();
    const toNode = (item: WorkItem): HierarchyNode => ({ id: item.id, type: item.type, parentId: item.parentId });
    cache.set(parent.id, toNode(parent));

    // Pré-charge la chaîne ascendante : `checkParent` est synchrone à dessein
    // (c'est une règle pure), donc la résolution se fait avant l'appel.
    let cursor = parent.parentId;
    const seen = new Set<number>([parent.id]);
    while (cursor !== null && !seen.has(cursor)) {
      seen.add(cursor);
      const ancestor = await this.repo.findOne({ where: { id: cursor } });
      if (!ancestor) break;
      cache.set(ancestor.id, toNode(ancestor));
      cursor = ancestor.parentId;
    }

    const violation = checkParent(toNode(child), toNode(parent), (id) => cache.get(id) ?? null);
    if (violation) throw new BadRequestException(violation.message);
  }

  /**
   * Où se situe un élément : ses ancêtres, son domaine et sa capacité.
   *
   * C'est la question « d'où vient ce ticket ? » posée au niveau de la
   * taxonomie, là où `source_*` y répond au niveau du document.
   */
  async lineage(id: number) {
    const item = await this.findOne(id);
    const cache = new Map<number, HierarchyNode>();
    let cursor = item.parentId;
    const seen = new Set<number>([item.id]);
    while (cursor !== null && !seen.has(cursor)) {
      seen.add(cursor);
      const ancestor = await this.repo.findOne({ where: { id: cursor } });
      if (!ancestor) break;
      cache.set(ancestor.id, { id: ancestor.id, type: ancestor.type, parentId: ancestor.parentId });
      cursor = ancestor.parentId;
    }
    const chain = lineageOf({ id: item.id, type: item.type, parentId: item.parentId }, (i) => cache.get(i) ?? null);
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      domainId: item.domainId,
      capabilityId: item.capabilityId,
      projectId: item.projectId,
      /** Le plus proche d'abord. */
      ancestors: chain,
    };
  }

  async findOne(id: number) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Ticket interne ${id} introuvable`);
    return item;
  }

  async findDetail(id: number) {
    const item = await this.findOne(id);
    const [comments, subtasks, history, dependencies] = await Promise.all([
      this.comments.find({ where: { workItemId: id }, order: { createdAt: 'ASC' } }),
      this.subtasks.find({ where: { workItemId: id }, order: { position: 'ASC' } }),
      this.events.find({ where: { workItemId: id }, order: { createdAt: 'DESC' }, take: 100 }),
      this.planning.dependenciesFor(id),
    ]);
    return { ...item, comments, subtasks, history, dependencies };
  }

  private async findProject(id: string) {
    const project = await this.projects.findOne({ where: { id } });
    if (!project) throw new NotFoundException(`Projet ${id} introuvable`);
    return project;
  }

  /**
   * `keyPrefix` is the authoritative, auto-generated project token (see
   * `roadmap-identifier.ts`). Legacy projects created before that
   * convention may still have a null `keyPrefix` — fall back to slugifying
   * the title rather than `appId`, a soft app-registry reference that was
   * never actually the right source for this (bug: previously read
   * `appId` here despite the entity doc calling `keyPrefix` authoritative).
   */
  private projectPrefix(project: RoadmapInitiative): string {
    return project.keyPrefix || slugifyProjectName(project.title);
  }

  /**
   * Atomically increments the project's `task_seq` counter and returns the
   * post-increment value — race-safe under concurrent task creation (a
   * single `UPDATE ... RETURNING`, no read-then-write gap), and never
   * reused since the counter is only ever incremented, never recomputed
   * from existing rows.
   */
  private async nextTaskSeq(projectId: string): Promise<number> {
    const result = await this.projects
      .createQueryBuilder()
      .update(RoadmapInitiative)
      .set({ taskSeq: () => '"task_seq" + 1' })
      .where('id = :projectId', { projectId })
      .returning('task_seq')
      .execute();
    return (result.raw[0] as { task_seq: number }).task_seq;
  }

  /**
   * Files a need in one field (REQ-01).
   *
   * The retired `StudioRequest` made this a four-step ritual — capture, triage,
   * a conversion modal re-asking a title and a priority it already held, then
   * an assignment. Here the item *is* the backlog entry from the first second,
   * so there is nothing to convert.
   *
   * It lands in `todo`, not `triage`: `triage` gates machine-generated batches
   * that a human has to accept, and putting a colleague's sentence behind an
   * approval would rebuild the ceremony this replaces. `projectId` stays
   * optional — the column is nullable, and demanding a project up front is
   * exactly the friction that made people stop filing.
   */
  async capture(dto: CaptureWorkItemDto, reporter: string) {
    const now = new Date();
    const project = dto.projectId ? await this.findProject(dto.projectId) : null;
    const item = this.repo.create({
      // A human-readable reference needs a project to draw its sequence from;
      // an unassigned capture gets one when it is filed under a project.
      reference: project ? taskReference(this.projectPrefix(project), await this.nextTaskSeq(project.id)) : null,
      projectId: project?.id ?? null,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      type: dto.type ?? 'task',
      status: 'todo',
      priority: dto.priority ?? 'P2',
      reporter,
      sourceKind: 'request',
      sourceAuthor: reporter,
      position: await this.repo.count({ where: { status: 'todo' } }),
      estimatePoints: 0,
      createdAt: now,
      updatedAt: now,
    });
    const saved = await this.repo.save(item);
    await this.events.save(
      this.events.create({ workItemId: saved.id, actor: reporter, action: 'created', meta: { via: 'capture' }, createdAt: now }),
    );
    return saved;
  }

  async create(dto: CreateWorkItemDto, reporter: string) {
    const project = await this.findProject(dto.projectId);
    if (dto.sprintId) await this.planning.assertSprint(dto.sprintId, project.id);
    const position = await this.repo.count({ where: { status: dto.status ?? 'todo' } });
    const now = new Date();
    const seq = await this.nextTaskSeq(project.id);
    const item = this.repo.create({
      reference: taskReference(this.projectPrefix(project), seq),
      projectId: project.id,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      type: dto.type ?? 'task',
      status: dto.status ?? 'todo',
      priority: dto.priority ?? 'P2',
      reporter,
      assignee: dto.assignee || null,
      dueDate: dto.dueDate ?? null,
      blockedReason: dto.blockedReason?.trim() || null,
      sprintId: dto.sprintId ?? null,
      estimatePoints: dto.estimatePoints ?? 0,
      category: dto.category ?? null,
      hoursSpent: dto.hoursSpent ?? null,
      progressPercent: dto.progressPercent ?? null,
      meetingId: dto.meetingId ?? null,
      position,
      createdAt: now,
      updatedAt: now,
      resolvedAt: dto.status === 'resolved' ? now : null,
      closedAt: dto.status === 'closed' ? now : null,
    });
    const saved = await this.repo.save(item);
    await this.record(saved.id, reporter, 'created', {
      reference: saved.reference,
      projectId: saved.projectId,
      status: saved.status,
      priority: saved.priority,
    });
    void this.notifyAssignee(saved, reporter, 'Nouveau ticket assigné', saved.title);
    return saved;
  }

  async update(id: number, dto: UpdateWorkItemDto, actor: string) {
    const item = await this.findOne(id);
    this.assertMutable(item);
    if (dto.projectId && dto.projectId !== item.projectId) {
      await this.findProject(dto.projectId);
    }
    const nextProjectId = dto.projectId ?? item.projectId;
    const nextSprintId = dto.sprintId === undefined ? item.sprintId : dto.sprintId;
    if (nextProjectId && nextSprintId) await this.planning.assertSprint(nextSprintId, nextProjectId);
    // Vérifié avant l'écriture : un rattachement refusé ne doit laisser aucune
    // trace, pas même dans le journal des changements construit plus bas.
    if (dto.parentId !== undefined && dto.parentId !== item.parentId) {
      await this.assertParentAllowed(item, dto.parentId ?? null);
    }
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const current = item as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(dto)) {
      if (current[key] !== value) changes[key] = { from: current[key], to: value };
    }
    const previousAssignee = item.assignee;
    const previousStatus = item.status;
    Object.assign(item, dto);
    this.applyStatusTimestamps(item, previousStatus, new Date());
    item.updatedAt = new Date();
    const saved = await this.repo.save(item);
    if (Object.keys(changes).length > 0) await this.record(id, actor, 'updated', { changes });
    if (saved.assignee && saved.assignee !== previousAssignee) {
      void this.notifyAssignee(saved, actor, 'Ticket assigné', saved.title);
    }
    return saved;
  }

  async move(id: number, status: WorkItemStatus, position: number | undefined, actor: string) {
    const item = await this.findOne(id);
    this.assertMutable(item);
    const from = item.status;
    const all = await this.repo.find();
    const targetPosition = position ?? all.filter((i) => i.status === status && i.id !== id).length;
    const placements = planMove(all, id, status, targetPosition);
    if (placements.length === 0) return item;

    const now = new Date();
    const rows = placements.map(({ id: placedId, status: placedStatus, position: placedPosition }) => {
      const row = placedId === id ? item : all.find((i) => i.id === placedId)!;
      const previousStatus = row.status;
      row.status = placedStatus;
      row.position = placedPosition;
      if (placedId === id) this.applyStatusTimestamps(row, previousStatus, now);
      row.updatedAt = now;
      return row;
    });
    const saved = await this.repo.save(rows);
    const movedItem = saved.find((row) => row.id === id)!;
    if (from !== status) {
      await this.record(id, actor, 'moved', { from, to: status });
      // Assignee only, not the reporter — the reporter is one of several
      // people looking at the same board; the assignee is the one whose
      // work someone else just moved. Reuses notifyAssignee's self-actor
      // guard: moving your own card notifies nobody.
      void this.notifyAssignee(movedItem, actor, 'Statut du ticket modifié', movedItem.title);
    }
    return movedItem;
  }

  /**
   * Closes every ticket that has sat in `resolved` past `REOPEN_WINDOW_MS`
   * — called daily by `StudioResolvedCloserScheduler`, same shape as
   * `StudioDueSoonScheduler`'s own `run()`.
   */
  async closeExpiredResolved(): Promise<WorkItem[]> {
    const cutoff = new Date(Date.now() - REOPEN_WINDOW_MS);
    const expired = await this.repo.find({ where: { status: 'resolved', resolvedAt: LessThanOrEqual(cutoff) } });
    if (expired.length === 0) return [];
    const now = new Date();
    for (const item of expired) {
      item.status = 'closed';
      item.closedAt = now;
      item.updatedAt = now;
    }
    const saved = await this.repo.save(expired);
    await Promise.all(
      saved.map((item) => this.record(item.id, 'system', 'closed', { reason: 'auto_close_after_reopen_window' })),
    );
    return saved;
  }

  /** Throws if `item` is `closed` — closed tickets are read-only, every mutation path included. */
  private assertMutable(item: WorkItem) {
    if (item.status === 'closed') {
      throw new ForbiddenException(
        `${item.reference ?? `#${item.id}`} est fermé et ne peut plus être modifié.`,
      );
    }
  }

  /** Stamps/clears `resolvedAt`/`closedAt` on a status transition. No-op if `item.status` didn't change. */
  private applyStatusTimestamps(item: WorkItem, previousStatus: WorkItemStatus, now: Date) {
    if (item.status === previousStatus) return;
    if (item.status === 'resolved') item.resolvedAt = now;
    else if (previousStatus === 'resolved') item.resolvedAt = null;
    if (item.status === 'closed') item.closedAt = now;
  }

  async listComments(id: number) {
    await this.findOne(id);
    return this.comments.find({ where: { workItemId: id }, order: { createdAt: 'ASC' } });
  }

  async addComment(id: number, dto: AddWorkItemCommentDto, actor: string) {
    const item = await this.findOne(id);
    this.assertMutable(item);
    const comment = await this.comments.save(this.comments.create({
      workItemId: id,
      author: actor,
      body: dto.body.trim(),
      createdAt: new Date(),
    }));
    await this.record(id, actor, 'commented', { commentId: comment.id });
    void this.notifyAssignee(item, actor, `Nouveau commentaire · ${item.reference}`, dto.body.trim());
    return comment;
  }

  async addSubtask(id: number, dto: AddWorkItemSubtaskDto, actor: string) {
    const item = await this.findOne(id);
    this.assertMutable(item);
    const position = await this.subtasks.count({ where: { workItemId: id } });
    const now = new Date();
    const subtask = await this.subtasks.save(this.subtasks.create({
      workItemId: id,
      title: dto.title.trim(),
      assignee: dto.assignee || null,
      done: false,
      position,
      createdAt: now,
      updatedAt: now,
    }));
    await this.record(id, actor, 'subtask_added', { subtaskId: subtask.id, title: subtask.title });
    return subtask;
  }

  async updateSubtask(id: string, dto: UpdateWorkItemSubtaskDto, actor: string) {
    const subtask = await this.subtasks.findOne({ where: { id } });
    if (!subtask) throw new NotFoundException(`Sous-tâche ${id} introuvable`);
    this.assertMutable(await this.findOne(subtask.workItemId));
    Object.assign(subtask, dto);
    subtask.updatedAt = new Date();
    const saved = await this.subtasks.save(subtask);
    await this.record(subtask.workItemId, actor, 'subtask_updated', {
      subtaskId: id,
      title: saved.title,
      done: saved.done,
    });
    return saved;
  }

  async listAttachments(id: number) {
    await this.findOne(id);
    return this.attachments.find({ where: { workItemId: id }, order: { createdAt: 'ASC' } });
  }

  async addAttachment(
    id: number,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    actor: string,
  ) {
    const item = await this.findOne(id);
    this.assertMutable(item);
    if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`Type de fichier non autorisé : ${file.mimetype}`);
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new BadRequestException(`Fichier trop volumineux (max ${MAX_ATTACHMENT_BYTES / 1_000_000} Mo)`);
    }
    const existing = await this.attachments.count({ where: { workItemId: id } });
    if (existing >= MAX_ATTACHMENTS_PER_TICKET) {
      throw new BadRequestException(`Maximum ${MAX_ATTACHMENTS_PER_TICKET} pièces jointes par ticket`);
    }
    const saved = await this.attachments.save(
      this.attachments.create({
        workItemId: id,
        originalName: file.originalname.slice(0, 255),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedBy: actor,
        createdAt: new Date(),
      }),
    );
    try {
      await saveAttachmentFile(saved.id, file.buffer);
    } catch (err) {
      const attachmentId = saved.id;
      await this.attachments.remove(saved);
      // Capture the id before .remove() — it clears the entity's primary key, same as
      // the removeAttachment fix (see git history for that one's full explanation).
      this.logger.error(
        `Échec de l'écriture de la pièce jointe ${attachmentId} pour le ticket ${id}: ${err instanceof Error ? err.message : err}`,
      );
      throw new InternalServerErrorException(
        "Échec de l'enregistrement de la pièce jointe — réessayez ou contactez le support si le problème persiste.",
      );
    }
    await this.record(id, actor, 'attachment_added', { attachmentId: saved.id, originalName: saved.originalName });
    return saved;
  }

  async getAttachmentFile(id: number, attachmentId: string) {
    const attachment = await this.attachments.findOne({ where: { id: attachmentId } });
    if (!attachment || attachment.workItemId !== id) {
      throw new NotFoundException(`Pièce jointe ${attachmentId} introuvable`);
    }
    try {
      const buffer = await readAttachmentFile(attachment.id);
      return { attachment, buffer };
    } catch (err) {
      this.logger.error(
        `Fichier manquant pour la pièce jointe ${attachment.id} (ticket ${id}): ${err instanceof Error ? err.message : err}`,
      );
      throw new GoneException('fichier indisponible');
    }
  }

  async removeAttachment(id: number, attachmentId: string, actor: string) {
    const item = await this.findOne(id);
    this.assertMutable(item);
    const attachment = await this.attachments.findOne({ where: { id: attachmentId } });
    if (!attachment || attachment.workItemId !== id) {
      throw new NotFoundException(`Pièce jointe ${attachmentId} introuvable`);
    }
    const originalName = attachment.originalName;
    await this.attachments.remove(attachment);
    // `.remove()` clears the primary key off `attachment` — capture `attachmentId` (the
    // param, never mutated) rather than `attachment.id`, which is `undefined` by this point.
    try {
      await deleteAttachmentFile(attachmentId);
    } catch (err) {
      // The DB row is already gone at this point — a failed file delete shouldn't cost
      // the audit entry below. Worst case is an orphaned file, which is recoverable.
      this.logger.error(
        `Échec de la suppression du fichier pour la pièce jointe ${attachmentId} (ticket ${id}): ${err instanceof Error ? err.message : err}`,
      );
    }
    await this.record(id, actor, 'attachment_removed', { attachmentId, originalName });
  }

  private record(
    workItemId: number,
    actor: string,
    action: WorkItemEventAction,
    meta: Record<string, unknown>,
  ) {
    return this.events.save(this.events.create({
      workItemId,
      actor,
      action,
      meta,
      createdAt: new Date(),
    }));
  }

  private async notifyAssignee(item: WorkItem, actor: string, title: string, body: string) {
    if (!item.assignee) return;
    const member = await this.team.findOne({ where: { id: item.assignee } });
    if (!member || member.email.toLowerCase() === actor.toLowerCase()) return;
    await this.push.sendTo(member.email, {
      title,
      body: body.slice(0, 180),
      url: '/work',
      tag: `work-item-${item.id}`,
    });
  }
}
