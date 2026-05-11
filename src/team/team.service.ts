import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

export interface InviteTeamMemberData {
  name: string;
  email: string;
  role: string;
  tag?: string;
  country?: string;
  perms?: string[];
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

  /**
   * Crée une row team_members pour un nouvel invité. L'activation du
   * login (création de l'utilisateur Keycloak côté nola-auth) reste à
   * faire manuellement ou via un appel HTTP séparé — ce service ne
   * touche que la couche d'affichage HQ.
   */
  async invite(data: InviteTeamMemberData) {
    const existing = await this.repo.findOne({ where: { email: data.email } });
    if (existing) {
      throw new BadRequestException(
        `Un membre avec l'email ${data.email} existe déjà`,
      );
    }
    const id = data.email.split('@')[0]?.replace(/[^a-z0-9]+/gi, '') || `m${Date.now()}`;
    const initials = data.name
      .split(/\s+/)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2);
    const saved = await this.repo.save(
      this.repo.create({
        id,
        name: data.name,
        email: data.email,
        role: data.role,
        tag: data.tag ?? '',
        avatar: initials || 'NA',
        hue: Math.floor(Math.random() * 360),
        online: false,
        country: data.country ?? 'CD',
        perms: data.perms ?? [],
        last: 'jamais',
        passwordHash: undefined,
      }),
    );
    return stripPassword(saved);
  }

  async remove(id: string) {
    const m = await this.repo.findOne({ where: { id } });
    if (!m) throw new NotFoundException(`Membre ${id} introuvable`);
    await this.repo.remove(m);
    return { ok: true };
  }
}

function stripPassword(m: TeamMember): Omit<TeamMember, 'passwordHash'> {
  const { passwordHash, ...rest } = m;
  void passwordHash;
  return rest;
}
