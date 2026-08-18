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
import { LessThanOrEqual, Repository } from 'typeorm';
import { PaginationDto, type PaginatedResult } from '../common/dto/pagination.dto';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { slugifyProjectName, taskReference } from '../roadmap/roadmap-identifier';
import { TeamMember } from '../team/team-member.entity';
import { PushService } from '../push/push.service';
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
  type WorkItemStatus,
} from './work-item.entity';
import {
  CreateWorkItemDto,
  ListWorkItemsDto,
  UpdateWorkItemDto,
  AddWorkItemCommentDto,
  AddWorkItemSubtaskDto,
  UpdateWorkItemSubtaskDto,
} from './dto/work-item.dto';

const STATUS_LABELS: Record<WorkItemStatus, string> = {
  todo: 'À faire',
  in_progress: 'En cours',
  blocked: 'Bloqué',
  review: 'En revue',
  resolved: 'Résolu',
  closed: 'Fermé',
};

const STATUS_TONES: Record<WorkItemStatus, string> = {
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

  async board(query: ListWorkItemsDto) {
    const result = await this.list({ ...query, page: 1, limit: 200 } as ListWorkItemsDto);
    return WORK_ITEM_STATUSES.map((status) => ({
      id: status,
      label: STATUS_LABELS[status],
      tone: STATUS_TONES[status],
      items: result.items.filter((item) => item.status === status),
    }));
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
    if (from !== status) await this.record(id, actor, 'moved', { from, to: status });
    return saved.find((row) => row.id === id)!;
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
      await this.attachments.remove(saved);
      this.logger.error(
        `Échec de l'écriture de la pièce jointe ${saved.id} pour le ticket ${id}: ${err instanceof Error ? err.message : err}`,
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
    await deleteAttachmentFile(attachmentId);
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
