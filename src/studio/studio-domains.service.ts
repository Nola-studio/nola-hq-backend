import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudioDomain } from './studio-domain.entity';
import { CreateDomainDto } from './dto/create-domain.dto';
import { UpdateDomainDto } from './dto/update-domain.dto';

@Injectable()
export class StudioDomainsService {
  constructor(
    @InjectRepository(StudioDomain)
    private readonly domains: Repository<StudioDomain>,
  ) {}

  async findAll(): Promise<StudioDomain[]> {
    return this.domains.find({ order: { renewalDate: 'ASC' } });
  }

  async findOne(id: string): Promise<StudioDomain> {
    const domain = await this.domains.findOne({ where: { id } });
    if (!domain) throw new NotFoundException(`Domaine ${id} introuvable`);
    return domain;
  }

  async create(dto: CreateDomainDto): Promise<StudioDomain> {
    const domain = this.domains.create({
      domain: dto.domain,
      purchaseDate: dto.purchaseDate ?? null,
      renewalDate: dto.renewalDate ?? null,
      registrar: dto.registrar ?? null,
      platform: dto.platform ?? null,
      purpose: dto.purpose ?? null,
      price: dto.price ?? null,
      autoRenew: dto.autoRenew ?? true,
      status: dto.status ?? null,
      linkedProjectId: dto.linkedProjectId ?? null,
      notes: dto.notes ?? null,
      workspace: dto.workspace ?? null,
      billingEmail: dto.billingEmail ?? null,
      paidByEmail: dto.paidByEmail ?? null,
      paymentMethod: dto.paymentMethod ?? null,
      billingCycle: dto.billingCycle ?? null,
      createdAt: new Date(),
    });
    return this.domains.save(domain);
  }

  async update(id: string, dto: UpdateDomainDto): Promise<StudioDomain> {
    const domain = await this.findOne(id);
    if (dto.domain !== undefined) domain.domain = dto.domain;
    if (dto.purchaseDate !== undefined) domain.purchaseDate = dto.purchaseDate;
    if (dto.renewalDate !== undefined) domain.renewalDate = dto.renewalDate;
    if (dto.registrar !== undefined) domain.registrar = dto.registrar;
    if (dto.platform !== undefined) domain.platform = dto.platform;
    if (dto.purpose !== undefined) domain.purpose = dto.purpose;
    if (dto.price !== undefined) domain.price = dto.price;
    if (dto.autoRenew !== undefined) domain.autoRenew = dto.autoRenew;
    if (dto.status !== undefined) domain.status = dto.status;
    if (dto.linkedProjectId !== undefined) domain.linkedProjectId = dto.linkedProjectId;
    if (dto.notes !== undefined) domain.notes = dto.notes;
    if (dto.workspace !== undefined) domain.workspace = dto.workspace;
    if (dto.billingEmail !== undefined) domain.billingEmail = dto.billingEmail;
    if (dto.paidByEmail !== undefined) domain.paidByEmail = dto.paidByEmail;
    if (dto.paymentMethod !== undefined) domain.paymentMethod = dto.paymentMethod;
    if (dto.billingCycle !== undefined) domain.billingCycle = dto.billingCycle;
    return this.domains.save(domain);
  }

  async remove(id: string): Promise<void> {
    const domain = await this.findOne(id);
    await this.domains.remove(domain);
  }
}
