import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Capability, Domain } from './domain.entity';
import { UpdateCapabilityDto, UpdateDomainDto } from './dto/update-domain.dto';

@Injectable()
export class DomainsService {
  constructor(
    @InjectRepository(Domain) private readonly domains: Repository<Domain>,
    @InjectRepository(Capability) private readonly capabilities: Repository<Capability>,
  ) {}

  /** Ordered by `position`, capabilities included — the shape the sidebar wants. */
  list(): Promise<Domain[]> {
    return this.domains.find({
      relations: ['capabilities'],
      order: { position: 'ASC', capabilities: { position: 'ASC' } },
    });
  }

  async findByCode(code: string): Promise<Domain> {
    const domain = await this.domains.findOne({
      where: { code: code.toUpperCase() as Domain['code'] },
      relations: ['capabilities'],
      order: { capabilities: { position: 'ASC' } },
    });
    if (!domain) throw new NotFoundException(`Domaine ${code} introuvable`);
    return domain;
  }

  async listCapabilities(code: string): Promise<Capability[]> {
    const domain = await this.findByCode(code);
    return this.capabilities.find({
      where: { domainId: domain.id },
      order: { position: 'ASC' },
    });
  }

  async updateDomain(code: string, dto: UpdateDomainDto): Promise<Domain> {
    const domain = await this.findByCode(code);
    if (dto.owner !== undefined) domain.owner = dto.owner;
    if (dto.position !== undefined) domain.position = dto.position;
    domain.updatedAt = new Date();
    return this.domains.save(domain);
  }

  async updateCapability(code: string, dto: UpdateCapabilityDto): Promise<Capability> {
    const capability = await this.capabilities.findOne({ where: { code: code.toUpperCase() } });
    if (!capability) throw new NotFoundException(`Capacité ${code} introuvable`);
    if (dto.owner !== undefined) capability.owner = dto.owner;
    if (dto.position !== undefined) capability.position = dto.position;
    capability.updatedAt = new Date();
    return this.capabilities.save(capability);
  }
}
