import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SlaPolicy } from './sla-policy.entity';
import { BusinessUnitResolverService } from '../company/business-unit-resolver.service';
import { CreateSlaPolicyDto } from './dto/create-sla-policy.dto';
import { UpdateSlaPolicyDto } from './dto/update-sla-policy.dto';

export interface SlaPolicySummary {
  id: string;
  businessUnitId: string;
  businessUnit: { code: string; name: string };
  priority: SlaPolicy['priority'];
  responseTargetMinutes: number | null;
  resolutionTargetMinutes: number | null;
}

@Injectable()
export class SlaPolicyService {
  constructor(
    @InjectRepository(SlaPolicy) private readonly repo: Repository<SlaPolicy>,
    private readonly businessUnitResolver: BusinessUnitResolverService,
  ) {}

  async list(businessUnitCode?: string): Promise<SlaPolicySummary[]> {
    const where = businessUnitCode
      ? { businessUnitId: await this.businessUnitResolver.resolve(businessUnitCode) }
      : {};
    const rows = await this.repo.find({ where, relations: ['businessUnit'], order: { priority: 'ASC' } });
    return rows.map((r) => this.toSummary(r));
  }

  async findOne(id: string): Promise<SlaPolicySummary> {
    const row = await this.repo.findOne({ where: { id }, relations: ['businessUnit'] });
    if (!row) throw new NotFoundException(`SLA policy ${id} introuvable`);
    return this.toSummary(row);
  }

  async create(dto: CreateSlaPolicyDto): Promise<SlaPolicySummary> {
    const businessUnitId = await this.businessUnitResolver.resolve(dto.businessUnitCode);
    const existing = await this.repo.findOne({ where: { businessUnitId, priority: dto.priority } });
    if (existing) {
      throw new ConflictException(
        `Une politique SLA existe déjà pour '${dto.businessUnitCode}' / ${dto.priority}`,
      );
    }

    const now = new Date();
    const row = this.repo.create({
      businessUnitId,
      priority: dto.priority,
      responseTargetMinutes: dto.responseTargetMinutes ?? null,
      resolutionTargetMinutes: dto.resolutionTargetMinutes ?? null,
      createdAt: now,
      updatedAt: now,
    });
    const saved = await this.repo.save(row);
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateSlaPolicyDto): Promise<SlaPolicySummary> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`SLA policy ${id} introuvable`);

    if (dto.responseTargetMinutes !== undefined) row.responseTargetMinutes = dto.responseTargetMinutes;
    if (dto.resolutionTargetMinutes !== undefined) row.resolutionTargetMinutes = dto.resolutionTargetMinutes;
    row.updatedAt = new Date();

    await this.repo.save(row);
    return this.findOne(id);
  }

  /** Reverts this (brand, priority) pair to "not tracked at all" — distinct from a target left null ("tracked, unconfigured"). */
  async remove(id: string): Promise<void> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`SLA policy ${id} introuvable`);
    await this.repo.remove(row);
  }

  private toSummary(r: SlaPolicy): SlaPolicySummary {
    return {
      id: r.id,
      businessUnitId: r.businessUnitId,
      businessUnit: { code: r.businessUnit!.code, name: r.businessUnit!.name },
      priority: r.priority,
      responseTargetMinutes: r.responseTargetMinutes,
      resolutionTargetMinutes: r.resolutionTargetMinutes,
    };
  }
}
