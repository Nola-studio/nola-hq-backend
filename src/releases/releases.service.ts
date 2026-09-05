import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Release, type ReleaseStatus } from './release.entity';
import { WorkItem } from '../work-items/work-item.entity';
import type { CreateReleaseDto, UpdateReleaseDto } from './dto/release.dto';

/** Ce qu'une version contient, par état — de quoi dire « prête ou pas ». */
export interface ReleaseContents {
  release: Release;
  total: number;
  byStatus: Record<string, number>;
  /** Ce qui reste ouvert : la réponse à « peut-on livrer ? ». */
  remaining: number;
}

@Injectable()
export class ReleasesService {
  private readonly logger = new Logger(ReleasesService.name);

  constructor(
    @InjectRepository(Release) private readonly releases: Repository<Release>,
    @InjectRepository(WorkItem) private readonly items: Repository<WorkItem>,
  ) {}

  /**
   * Les versions, la plus récente d'abord.
   *
   * Les annulées sont exclues par défaut : elles ne se planifient plus, mais
   * leur histoire reste consultable.
   */
  list(includeCancelled = false): Promise<Release[]> {
    return this.releases.find({
      where: includeCancelled ? {} : [{ status: 'planned' }, { status: 'in_progress' }, { status: 'released' }],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Release> {
    const found = await this.releases.findOne({ where: { id } });
    if (!found) throw new NotFoundException(`Version ${id} introuvable`);
    return found;
  }

  async create(dto: CreateReleaseDto): Promise<Release> {
    const version = dto.version.trim();
    const existing = await this.releases.findOne({ where: { version } });
    if (existing) {
      throw new ConflictException(`La version ${version} existe déjà.`);
    }

    const now = new Date();
    return this.releases.save(
      this.releases.create({
        version,
        name: dto.name?.trim() || null,
        status: dto.status ?? 'planned',
        targetDate: dto.targetDate ?? null,
        releasedAt: null,
        notes: dto.notes ?? null,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  async update(id: string, dto: UpdateReleaseDto): Promise<Release> {
    const release = await this.findOne(id);

    if (dto.version && dto.version.trim() !== release.version) {
      const taken = await this.releases.findOne({ where: { version: dto.version.trim() } });
      if (taken) throw new ConflictException(`La version ${dto.version.trim()} existe déjà.`);
      release.version = dto.version.trim();
    }
    if (dto.name !== undefined) release.name = dto.name?.trim() || null;
    if (dto.targetDate !== undefined) release.targetDate = dto.targetDate;
    if (dto.notes !== undefined) release.notes = dto.notes;
    if (dto.status) this.applyStatus(release, dto.status);

    release.updatedAt = new Date();
    return this.releases.save(release);
  }

  /**
   * `released_at` n'est pas un champ qu'on saisit : il est daté par le passage
   * à `released`, et effacé si l'on revient en arrière. Le laisser modifiable
   * permettrait de dater une livraison qui n'a pas eu lieu.
   */
  private applyStatus(release: Release, status: ReleaseStatus): void {
    if (status === 'released' && release.status !== 'released') {
      release.releasedAt = new Date();
    }
    if (status !== 'released') {
      release.releasedAt = null;
    }
    release.status = status;
  }

  /** Ce que la version contient, et ce qu'il reste avant de pouvoir la livrer. */
  async contents(id: string): Promise<ReleaseContents> {
    const release = await this.findOne(id);
    const rows = await this.items.find({
      where: { releaseId: id },
      select: { id: true, status: true },
    });

    const byStatus: Record<string, number> = {};
    for (const row of rows) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;

    return {
      release,
      total: rows.length,
      byStatus,
      remaining: rows.filter((r) => r.status !== 'resolved' && r.status !== 'closed').length,
    };
  }

  /**
   * Pose la version sur un ticket, et la fait descendre sur tout ce qu'il
   * porte — stories, sous-tâches, à n'importe quelle profondeur.
   *
   * On ne livre pas la moitié d'un epic : sa version est celle de son
   * contenu. Mais la cascade ne défait pas une décision — un enfant qu'on a
   * délibérément déplacé vers une autre version garde le sien. Ne suivent que
   * ceux qui suivaient déjà : sans version, ou avec celle que l'epic quitte.
   *
   * @returns le nombre de descendants effectivement déplacés.
   */
  async assignToWorkItem(workItemId: number, releaseId: string | null): Promise<number> {
    const item = await this.items.findOne({ where: { id: workItemId } });
    if (!item) throw new NotFoundException(`Ticket ${workItemId} introuvable`);
    if (releaseId) await this.findOne(releaseId);

    const previous = item.releaseId;
    if (previous === releaseId) return 0;

    const now = new Date();
    item.releaseId = releaseId;
    item.updatedAt = now;
    await this.items.save(item);

    const descendants = await this.descendantsOf(workItemId);
    if (descendants.length === 0) return 0;

    const followers = descendants.filter((d) => d.releaseId === null || d.releaseId === previous);
    if (followers.length === 0) return 0;

    await this.items.update(
      { id: In(followers.map((f) => f.id)) },
      { releaseId, updatedAt: now },
    );
    this.logger.log(
      `Version ${releaseId ?? '(aucune)'} propagée à ${followers.length} descendant(s) du ticket ${workItemId}.`,
    );
    return followers.length;
  }

  /**
   * Toute la descendance, par paliers.
   *
   * Une requête par niveau plutôt qu'une récursive : la hiérarchie du
   * référentiel fait trois étages (epic → story → sous-tâche), et un `WITH
   * RECURSIVE` ne s'écrit pas pareil sur SQLite et sur Postgres, que ce dépôt
   * fait tourner tous les deux. La garde de profondeur protège d'un cycle que
   * les contraintes de parenté interdisent déjà.
   */
  private async descendantsOf(rootId: number): Promise<WorkItem[]> {
    const found: WorkItem[] = [];
    let frontier = [rootId];
    const seen = new Set<number>([rootId]);

    for (let depth = 0; depth < 8 && frontier.length > 0; depth += 1) {
      const children = await this.items.find({
        where: { parentId: In(frontier) },
        select: { id: true, releaseId: true },
      });
      frontier = [];
      for (const child of children) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        found.push(child);
        frontier.push(child.id);
      }
    }
    return found;
  }

  /**
   * Les tickets d'une version qui n'ont pas de parent dans cette même version
   * — la vue « ce que contient la 1.4 » sans répéter chaque sous-tâche sous
   * son epic.
   */
  async rootsOf(id: string): Promise<WorkItem[]> {
    await this.findOne(id);
    const rows = await this.items.find({ where: { releaseId: id }, order: { position: 'ASC' } });
    const ids = new Set(rows.map((r) => r.id));
    return rows.filter((r) => r.parentId === null || !ids.has(r.parentId));
  }

  /** Résout un numéro écrit à la main — « 1.4 » — contre le registre. */
  async findByVersion(version: string): Promise<Release | null> {
    const needle = version.trim();
    if (!needle) return null;
    return this.releases.findOne({ where: { version: needle } });
  }

  /**
   * Retirer une version du registre.
   *
   * Refusé dès qu'elle porte du travail : effacer le rattachement de
   * quarante tickets au passage n'est pas une suppression, c'est une
   * replanification. `cancelled` est là pour ça.
   */
  async remove(id: string): Promise<void> {
    const count = await this.items.count({ where: { releaseId: id } });
    if (count > 0) {
      throw new BadRequestException(
        `Cette version porte ${count} ticket(s) — annulez-la plutôt que de la supprimer.`,
      );
    }
    await this.releases.delete({ id });
  }

  /** Combien de tickets par version, pour afficher les listes sans N+1. */
  async countsByRelease(): Promise<Record<string, number>> {
    const rows = await this.items.find({
      where: { releaseId: Not(IsNull()) },
      select: { id: true, releaseId: true },
    });
    const counts: Record<string, number> = {};
    for (const row of rows) {
      if (row.releaseId) counts[row.releaseId] = (counts[row.releaseId] ?? 0) + 1;
    }
    return counts;
  }
}