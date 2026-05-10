import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeamMember } from './team-member.entity';

export interface UpdateTeamMemberDto {
  name?: string;
  role?: string;
  tag?: string;
  email?: string;
  country?: string;
  perms?: string[];
  online?: boolean;
}

@Injectable()
export class TeamService {
  constructor(
    @InjectRepository(TeamMember)
    private readonly repo: Repository<TeamMember>,
  ) {}

  findAll() {
    return this.repo
      .find({ order: { name: 'ASC' } })
      .then((members) => members.map(stripPassword));
  }

  async findOne(id: string) {
    const m = await this.repo.findOne({ where: { id } });
    if (!m) throw new NotFoundException(`Membre ${id} introuvable`);
    return stripPassword(m);
  }

  async update(id: string, dto: UpdateTeamMemberDto) {
    const m = await this.repo.findOne({ where: { id } });
    if (!m) throw new NotFoundException(`Membre ${id} introuvable`);
    Object.assign(m, dto);
    const saved = await this.repo.save(m);
    return stripPassword(saved);
  }
}

function stripPassword(m: TeamMember): Omit<TeamMember, 'passwordHash'> {
  const { passwordHash, ...rest } = m;
  void passwordHash;
  return rest;
}
