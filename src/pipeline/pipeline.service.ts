import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PipelineItem, PipelineStageId } from './pipeline-item.entity';
import { UpsertPipelineItemDto } from './dto/upsert-pipeline-item.dto';

const STAGE_TONES: Record<PipelineStageId, string> = {
  prospect: '#94A3B8',
  demo: '#4F46E5',
  trial: '#D97706',
  signed: '#16A34A',
  onboarded: '#1F4D3A',
};

const STAGE_LABELS: Record<PipelineStageId, string> = {
  prospect: 'Prospect',
  demo: 'Démo',
  trial: 'Trial',
  signed: 'Signé',
  onboarded: 'Onboardé',
};

@Injectable()
export class PipelineService {
  constructor(
    @InjectRepository(PipelineItem)
    private readonly repo: Repository<PipelineItem>,
  ) {}

  async board() {
    const items = await this.repo.find();
    const stages: { stage: string; id: PipelineStageId; tone: string; items: PipelineItem[] }[] = (
      Object.keys(STAGE_LABELS) as PipelineStageId[]
    ).map((id) => ({
      id,
      stage: STAGE_LABELS[id],
      tone: STAGE_TONES[id],
      items: items.filter((i) => i.stage === id),
    }));
    return stages;
  }

  findAll() {
    return this.repo.find();
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Pipeline ${id} introuvable`);
    return item;
  }

  async create(dto: UpsertPipelineItemDto) {
    const id = dto.id ?? `pi-${Date.now()}`;
    const item = this.repo.create({
      id,
      stage: dto.stage,
      name: dto.name,
      country: dto.country,
      amt: dto.amt,
      owner: dto.owner,
      age: dto.age ?? '0 j',
    });
    return this.repo.save(item);
  }

  async update(id: string, dto: Partial<UpsertPipelineItemDto>) {
    const item = await this.findOne(id);
    Object.assign(item, dto);
    return this.repo.save(item);
  }

  async move(id: string, stage: PipelineStageId) {
    const item = await this.findOne(id);
    item.stage = stage;
    return this.repo.save(item);
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.repo.remove(item);
    return { ok: true };
  }
}
