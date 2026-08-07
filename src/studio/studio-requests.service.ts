import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudioRequest } from './studio-request.entity';
import { CreateStudioRequestDto } from './dto/create-studio-request.dto';
import { UpdateStudioRequestDto } from './dto/update-studio-request.dto';
import { UpdateStudioRequestStatusDto } from './dto/update-studio-request-status.dto';
import { ListStudioRequestsDto } from './dto/list-studio-requests.dto';

const TERMINAL_STATUSES = ['rejetee', 'fermee'];

@Injectable()
export class StudioRequestsService {
  constructor(
    @InjectRepository(StudioRequest)
    private readonly requests: Repository<StudioRequest>,
  ) {}

  async findAll(filter: ListStudioRequestsDto = {}): Promise<StudioRequest[]> {
    const qb = this.requests.createQueryBuilder('r');
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
    const request = await this.requests.findOne({ where: { id } });
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
    request.status = dto.status;
    request.updatedAt = new Date();
    request.closedAt = TERMINAL_STATUSES.includes(dto.status) ? request.updatedAt : null;
    return this.requests.save(request);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.requests.delete(id);
  }
}
