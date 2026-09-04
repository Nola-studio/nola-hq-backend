import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import {
  InvalidRepositoryRef,
  parseRepositoryRef,
  repositorySlug,
  type RepositoryRef,
} from './repository-slug';
import { GithubAppService } from './github-app.service';
import { CodeRepository, RepositoryProject } from './repository.entity';
import type {
  LinkProjectDto,
  ListRepositoriesDto,
  RegisterRepositoryDto,
  UpdateRepositoryDto,
} from './dto/repository.dto';

/**
 * Le registre des dépôts de code (ENG-06).
 *
 * HQ ne réplique pas GitHub. Il tient la liste de ce qui existe, à quoi
 * chaque dépôt sert, et qui a le droit d'y travailler — le minimum sans
 * lequel « sélectionner le repository cible » d'ENG-08 n'a rien à proposer.
 */
@Injectable()
export class RepositoriesService {
  constructor(
    @InjectRepository(CodeRepository)
    private readonly repos: Repository<CodeRepository>,
    @InjectRepository(RepositoryProject)
    private readonly links: Repository<RepositoryProject>,
    @InjectRepository(RoadmapInitiative)
    private readonly projects: Repository<RoadmapInitiative>,
    private readonly github: GithubAppService,
  ) {}

  async list(query: ListRepositoriesDto = {}): Promise<CodeRepository[]> {
    const qb = this.repos
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.product', 'product')
      .leftJoinAndSelect('r.domain', 'domain');

    if (!query.includeArchived) qb.andWhere('r.archived = :archived', { archived: false });
    if (query.productId) qb.andWhere('r.productId = :productId', { productId: query.productId });
    if (query.domainId) qb.andWhere('r.domainId = :domainId', { domainId: query.domainId });
    if (query.projectId) {
      qb.andWhere(
        'r.id IN (SELECT link.repository_id FROM repository_projects link WHERE link.project_id = :projectId)',
        { projectId: query.projectId },
      );
    }
    if (query.q) {
      qb.andWhere('(LOWER(r.owner) LIKE :q OR LOWER(r.name) LIKE :q OR LOWER(r.description) LIKE :q)', {
        q: `%${query.q.toLowerCase()}%`,
      });
    }

    return qb.orderBy('r.owner', 'ASC').addOrderBy('r.name', 'ASC').getMany();
  }

  /**
   * Les dépôts qu'un projet a le droit d'utiliser (ENG-08).
   *
   * Un projet sans aucun dépôt déclaré ne se voit pas offrir tout le
   * catalogue : proposer un dépôt que personne n'a autorisé pour ce projet
   * est exactement ce que la règle interdit. Une liste vide est une réponse,
   * pas une lacune à combler.
   */
  async allowedFor(projectId: string): Promise<CodeRepository[]> {
    await this.requireProject(projectId);
    return this.list({ projectId });
  }

  /**
   * Les dépôts qu'un ticket peut viser.
   *
   * Le projet d'abord — c'est l'autorisation la plus explicite. À défaut, le
   * domaine : les items d'un référentiel arrivent classés par domaine et sans
   * projet, et ce sont précisément ceux sur lesquels on veut démarrer du
   * travail. Exiger un projet les bloquerait tous.
   *
   * Pas de repli quand un projet existe mais n'a aucun dépôt : un rattachement
   * explicite est une décision, et l'élargir en douce la viderait de son sens.
   */
  async allowedForWorkItem(scope: {
    projectId?: string | null;
    domainId?: string | null;
  }): Promise<CodeRepository[]> {
    if (scope.projectId) return this.allowedFor(scope.projectId);
    if (scope.domainId) return this.list({ domainId: scope.domainId });
    return [];
  }

  async findOne(id: string): Promise<CodeRepository> {
    const found = await this.repos.findOne({ where: { id }, relations: ['product', 'domain'] });
    if (!found) throw new NotFoundException(`Dépôt ${id} introuvable`);
    return found;
  }

  /** Retrouve par `owner/name`, sans distinguer la casse — comme GitHub. */
  async findByRef(ref: RepositoryRef): Promise<CodeRepository | null> {
    return this.repos
      .createQueryBuilder('r')
      .where('LOWER(r.owner) = :owner', { owner: ref.owner.toLowerCase() })
      .andWhere('LOWER(r.name) = :name', { name: ref.name.toLowerCase() })
      .getOne();
  }

  async register(dto: RegisterRepositoryDto): Promise<CodeRepository> {
    const ref = this.parse(dto.ref);

    const existing = await this.findByRef(ref);
    if (existing) {
      throw new ConflictException(
        `${repositorySlug(ref)} est déjà enregistré${existing.archived ? ' (archivé)' : ''}.`,
      );
    }

    const now = new Date();
    return this.repos.save(
      this.repos.create({
        provider: 'github',
        owner: ref.owner,
        name: ref.name,
        externalId: dto.externalId ?? null,
        // GitHub déclarera la vraie branche par défaut à la première
        // synchronisation ; d'ici là `main` est une supposition, pas un fait.
        defaultBranch: dto.defaultBranch ?? 'main',
        visibility: dto.visibility ?? 'private',
        archived: false,
        htmlUrl: dto.htmlUrl ?? `https://github.com/${repositorySlug(ref)}`,
        description: dto.description ?? null,
        productId: dto.productId ?? null,
        domainId: dto.domainId ?? null,
        steward: dto.steward ?? null,
        lastSyncedAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  async update(id: string, dto: UpdateRepositoryDto): Promise<CodeRepository> {
    const repo = await this.findOne(id);
    Object.assign(repo, dto, { updatedAt: new Date() });
    return this.repos.save(repo);
  }

  /**
   * Archiver plutôt que supprimer. Un dépôt retiré du registre emporterait
   * les liens qui expliquent pourquoi telle branche existe ; l'archivage le
   * sort des listes sans effacer l'histoire.
   */
  async archive(id: string): Promise<CodeRepository> {
    return this.update(id, { archived: true });
  }

  async linkProject(id: string, dto: LinkProjectDto): Promise<RepositoryProject> {
    const repo = await this.findOne(id);
    if (repo.archived) {
      throw new BadRequestException(`${repositorySlug(repo)} est archivé — le désarchiver d'abord.`);
    }
    await this.requireProject(dto.projectId);

    const existing = await this.links.findOne({
      where: { repositoryId: id, projectId: dto.projectId },
    });
    if (existing) return existing;

    return this.links.save(
      this.links.create({ repositoryId: id, projectId: dto.projectId, createdAt: new Date() }),
    );
  }

  async unlinkProject(id: string, projectId: string): Promise<void> {
    const result = await this.links.delete({ repositoryId: id, projectId });
    if (!result.affected) {
      throw new NotFoundException(`Le projet ${projectId} n'est pas rattaché à ce dépôt.`);
    }
  }

  /** Les projets rattachés à un dépôt, pour l'écran du dépôt. */
  async projectsOf(id: string): Promise<RoadmapInitiative[]> {
    await this.findOne(id);
    const links = await this.links.find({ where: { repositoryId: id } });
    if (links.length === 0) return [];
    return this.projects.find({ where: { id: In(links.map((l) => l.projectId)) } });
  }

  /**
   * Rapproche un dépôt de ce que GitHub en dit (ENG-06).
   *
   * GitHub fait autorité sur tout ce qui est repris ici — branche par défaut,
   * visibilité, archivage, description, casse du nom. HQ ne discute pas ces
   * champs : il les reflète. Ce qu'il garde en propre, ce sont les
   * rattachements qu'il est seul à connaître : produit, domaine, responsable,
   * projets autorisés.
   *
   * Un dépôt renommé sur GitHub est reconnu par son `external_id` et suit son
   * nouveau nom, plutôt que de devenir un doublon au prochain enregistrement.
   */
  async sync(id: string): Promise<CodeRepository> {
    const repo = await this.findOne(id);
    const facts = await this.github.fetchRepository(repo.owner, repo.name);

    if (repo.externalId && repo.externalId !== facts.externalId) {
      throw new ConflictException(
        `${repositorySlug(repo)} pointe désormais vers un autre dépôt (${repo.externalId} → ${facts.externalId}). ` +
          `Un transfert ou une recréation demande une décision : enregistrez le nouveau dépôt et archivez celui-ci.`,
      );
    }

    Object.assign(repo, {
      externalId: facts.externalId,
      owner: facts.owner,
      name: facts.name,
      defaultBranch: facts.defaultBranch,
      visibility: facts.visibility,
      // Un dépôt archivé sur GitHub l'est ici aussi ; l'inverse n'est pas
      // vrai — archiver dans HQ est une décision locale.
      archived: repo.archived || facts.archived,
      htmlUrl: facts.htmlUrl,
      description: facts.description,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    });

    return this.repos.save(repo);
  }

  private parse(input: string): RepositoryRef {
    try {
      return parseRepositoryRef(input);
    } catch (err) {
      if (err instanceof InvalidRepositoryRef) throw new BadRequestException(err.message);
      throw err;
    }
  }

  private async requireProject(projectId: string): Promise<RoadmapInitiative> {
    const project = await this.projects.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException(`Projet ${projectId} introuvable`);
    return project;
  }
}
