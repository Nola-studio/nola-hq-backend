import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudioRequest, type StudioRequestPriority } from './studio-request.entity';
import { CreateStudioRequestDto } from './dto/create-studio-request.dto';
import { UpdateStudioRequestDto } from './dto/update-studio-request.dto';
import { UpdateStudioRequestStatusDto } from './dto/update-studio-request-status.dto';
import { ListStudioRequestsDto } from './dto/list-studio-requests.dto';
import { ConvertStudioRequestDto } from './dto/convert-studio-request.dto';
import { StudioProjectsProxyService } from './studio-projects-proxy.service';
import type { StudioTaskPriority } from '../work-items/work-item-studio-mapping';

const TERMINAL_STATUSES = ['rejetee', 'fermee'];

/** A request's `P0-P3` triage priority folds onto the ticket's `none..urgent` scale. */
const REQUEST_PRIORITY_TO_TASK_PRIORITY: Record<StudioRequestPriority, StudioTaskPriority> = {
  P0: 'urgent',
  P1: 'high',
  P2: 'medium',
  P3: 'low',
};

@Injectable()
export class StudioRequestsService {
  constructor(
    @InjectRepository(StudioRequest)
    private readonly requests: Repository<StudioRequest>,
    private readonly tasksProxy: StudioProjectsProxyService,
  ) {}

  async findAll(filter: ListStudioRequestsDto = {}): Promise<StudioRequest[]> {
    const qb = this.requests.createQueryBuilder('r').leftJoinAndSelect('r.linkedWorkItem', 'linkedWorkItem');
    if (filter.type) qb.andWhere('r.type = :type', { type: filter.type });
    if (filter.status) qb.andWhere('r.status = :status', { status: filter.status });
    if (filter.priority) qb.andWhere('r.priority = :priority', { priority: filter.priority });
    if (filter.project) qb.andWhere('r.projectId = :project', { project: filter.project });
    if (filter.assignee) qb.andWhere('r.assignee = :assignee', { assignee: filter.assignee });
    if (filter.author) qb.andWhere('r.author = :author', { author: filter.author });
    qb.orderBy('r.createdAt', 'DESC');
    return qb.getMany();
  }

  async findOne(id: string): Promise<StudioRequest> {
    const request = await this.requests.findOne({ where: { id }, relations: ['linkedWorkItem'] });
    if (!request) throw new NotFoundException(`Demande ${id} introuvable`);
    return request;
  }

  create(dto: CreateStudioRequestDto, authorEmail: string): Promise<StudioRequest> {
    const now = new Date();
    return this.requests.save(
      this.requests.create({
        title: dto.title,
        description: dto.description ?? null,
        type: dto.type,
        projectId: dto.projectId ?? null,
        author: authorEmail,
        assignee: dto.assigneeEmail ?? null,
        priority: dto.priority ?? 'P2',
        status: 'nouvelle',
        createdAt: now,
        updatedAt: now,
        closedAt: null,
      }),
    );
  }

  async update(id: string, dto: UpdateStudioRequestDto): Promise<StudioRequest> {
    const request = await this.findOne(id);
    if (dto.title !== undefined) request.title = dto.title;
    if (dto.description !== undefined) request.description = dto.description;
    if (dto.type !== undefined) request.type = dto.type;
    if (dto.projectId !== undefined) request.projectId = dto.projectId;
    if (dto.assigneeEmail !== undefined) request.assignee = dto.assigneeEmail;
    if (dto.priority !== undefined) request.priority = dto.priority;
    request.updatedAt = new Date();
    return this.requests.save(request);
  }

  async updateStatus(id: string, dto: UpdateStudioRequestStatusDto): Promise<StudioRequest> {
    const request = await this.findOne(id);
    this.assertStatusMutable(request);
    request.status = dto.status;
    request.updatedAt = new Date();
    request.closedAt = TERMINAL_STATUSES.includes(dto.status) ? request.updatedAt : null;
    return this.requests.save(request);
  }

  /**
   * Throws if `request` is already terminal (`rejetee` or `fermee`) — no
   * Owner/admin override, matching `WorkItem.assertMutable()`'s posture
   * that closed items are not reopenable by anyone. Narrower than
   * `WorkItem`'s guard: this only blocks further *status* changes, not
   * every mutation (title/description edits on a closed request still go
   * through `update()` unguarded).
   */
  private assertStatusMutable(request: StudioRequest) {
    if (TERMINAL_STATUSES.includes(request.status)) {
      throw new ForbiddenException(
        `Cette demande est ${request.status === 'fermee' ? 'fermée' : 'rejetée'} et ne peut plus changer de statut.`,
      );
    }
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.requests.delete(id);
  }

  /**
   * Files the ticket a request resolves into and links the two — the
   * request stays visible (now as `acceptee`) with a reference to what came
   * of it, instead of silently vanishing from the queue like a plain status
   * change would.
   */
  async convert(
    id: string,
    dto: ConvertStudioRequestDto,
    actorEmail: string,
  ): Promise<{ request: StudioRequest; task: Awaited<ReturnType<StudioProjectsProxyService['createTask']>> }> {
    const request = await this.findOne(id);
    this.assertStatusMutable(request);
    if (request.linkedWorkItemId) {
      throw new ConflictException(
        `Cette demande est déjà convertie (ticket ${request.linkedWorkItem?.reference ?? request.linkedWorkItemId}).`,
      );
    }

    const task = await this.tasksProxy.createTask(
      {
        projectId: dto.projectId,
        category: dto.category,
        title: dto.title ?? request.title,
        description: dto.description ?? request.description ?? undefined,
        priority: dto.priority ?? REQUEST_PRIORITY_TO_TASK_PRIORITY[request.priority],
        assigneeEmail: dto.assigneeEmail ?? request.assignee ?? undefined,
        dueDate: dto.dueDate,
      },
      actorEmail,
    );

    request.linkedWorkItemId = Number(task.id);
    request.status = 'acceptee';
    request.updatedAt = new Date();
    const saved = await this.requests.save(request);
    return { request: saved, task };
  }
}
