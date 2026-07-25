import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { RoadmapObjective } from './roadmap-objective.entity';
import { RoadmapInitiative } from './roadmap-initiative.entity';
import { RoadmapMilestone } from './roadmap-milestone.entity';
import {
  RoadmapBoardColumn,
  RoadmapTimelineBucket,
  buildBoard,
  buildTimeline,
  planMove,
} from './roadmap.board';
import {
  deriveInitiativeProgress,
  deriveObjectiveProgress,
} from './roadmap.progress';
import { CreateObjectiveDto } from './dto/create-objective.dto';
import { UpdateObjectiveDto } from './dto/update-objective.dto';
import { CreateInitiativeDto } from './dto/create-initiative.dto';
import { UpdateInitiativeDto } from './dto/update-initiative.dto';
import { MoveInitiativeDto } from './dto/move-initiative.dto';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
import {
  ListInitiativesDto,
  ListObjectivesDto,
} from './dto/list-roadmap.dto';

/**
 * An initiative as the API returns it: the stored row plus the **effective**
 * progress (derived from its milestones when it has any) and the checklist
 * counters the UI renders.
 */
export interface RoadmapInitiativeView extends RoadmapInitiative {
  milestoneCount: number;
  milestonesDone: number;
  /** Only hydrated by `findInitiative` — the list views stay light. */
  milestones?: RoadmapMilestone[];
}

/**
 * An objective as the API returns it: the stored row plus the effective
 * progress (mean of its non-dropped initiatives).
 */
export interface RoadmapObjectiveView extends RoadmapObjective {
  initiativeCount: number;
  /** Only hydrated by `findObjective`. */
  initiatives?: RoadmapInitiativeView[];
}

/**
 * Nola Studio's own strategy tool: quarterly **objectives** → **initiatives**
 * (projects/workstreams) → **milestones** (execution checkpoints).
 *
 * Purely DB-backed — no NATS, no tenant coupling. All percentage arithmetic
 * lives in `roadmap.progress.ts` and all grouping/ordering in
 * `roadmap.board.ts`; this service only fetches and persists.
 *
 * Progress is **derived at read time** and never written back: an
 * initiative's stored `progress` stays the operator-set fallback used while
 * it has no milestone.
 */
@Injectable()
export class RoadmapService {
  constructor(
    @InjectRepository(RoadmapObjective)
    private readonly objectives: Repository<RoadmapObjective>,
    @InjectRepository(RoadmapInitiative)
    private readonly initiatives: Repository<RoadmapInitiative>,
    @InjectRepository(RoadmapMilestone)
    private readonly milestones: Repository<RoadmapMilestone>,
  ) {}

  // ── board & timeline ─────────────────────────────────────────────

  /** Kanban columns by status, each ordered by `position`. */
  async board(): Promise<RoadmapBoardColumn<RoadmapInitiativeView>[]> {
    const views = await this.withProgress(await this.initiatives.find());
    return buildBoard(views);
  }

  /** Initiatives bucketed by quarter, unscheduled ones last. */
  async timeline(): Promise<RoadmapTimelineBucket<RoadmapInitiativeView>[]> {
    const views = await this.withProgress(await this.initiatives.find());
    return buildTimeline(views);
  }

  // ── objectives ───────────────────────────────────────────────────

  async listObjectives(
    filter: ListObjectivesDto = {},
  ): Promise<RoadmapObjectiveView[]> {
    const where: FindOptionsWhere<RoadmapObjective> = {};
    if (filter.quarter) where.quarter = filter.quarter;
    if (filter.status) where.status = filter.status;

    const rows = await this.objectives.find({
      where,
      order: { quarter: 'ASC', createdAt: 'DESC' },
    });
    if (rows.length === 0) return [];

    const children = await this.initiatives.find({
      where: { objectiveId: In(rows.map((o) => o.id)) },
    });
    const withProgress = await this.withProgress(children);
    return rows.map((o) =>
      this.objectiveView(
        o,
        withProgress.filter((i) => i.objectiveId === o.id),
      ),
    );
  }

  /** Single objective, hydrated with its initiatives. */
  async findObjective(id: string): Promise<RoadmapObjectiveView> {
    const objective = await this.objectives.findOne({ where: { id } });
    if (!objective) throw new NotFoundException(`Objectif ${id} introuvable`);
    const children = await this.withProgress(
      await this.initiatives.find({
        where: { objectiveId: id },
        order: { position: 'ASC', createdAt: 'ASC' },
      }),
    );
    return { ...this.objectiveView(objective, children), initiatives: children };
  }

  async createObjective(dto: CreateObjectiveDto): Promise<RoadmapObjectiveView> {
    const now = new Date();
    const objective = this.objectives.create({
      title: dto.title,
      description: dto.description ?? null,
      quarter: dto.quarter ?? null,
      status: dto.status ?? 'draft',
      owner: dto.owner ?? null,
      progress: dto.progress ?? 0,
      createdAt: now,
      updatedAt: now,
    });
    const saved = await this.objectives.save(objective);
    return this.objectiveView(saved, []);
  }

  async updateObjective(
    id: string,
    dto: UpdateObjectiveDto,
  ): Promise<RoadmapObjectiveView> {
    const objective = await this.objectives.findOne({ where: { id } });
    if (!objective) throw new NotFoundException(`Objectif ${id} introuvable`);

    if (dto.title !== undefined) objective.title = dto.title;
    if (dto.description !== undefined)
      objective.description = dto.description ?? null;
    if (dto.quarter !== undefined) objective.quarter = dto.quarter ?? null;
    if (dto.status !== undefined) objective.status = dto.status;
    if (dto.owner !== undefined) objective.owner = dto.owner ?? null;
    if (dto.progress !== undefined) objective.progress = dto.progress;
    objective.updatedAt = new Date();

    const saved = await this.objectives.save(objective);
    const children = await this.withProgress(
      await this.initiatives.find({ where: { objectiveId: id } }),
    );
    return this.objectiveView(saved, children);
  }

  /**
   * Deletes an objective. Its initiatives are **kept** and detached
   * (`objective_id` → NULL by FK) — deleting a strategic goal must never
   * silently drop the work that was done under it.
   */
  async removeObjective(id: string) {
    const objective = await this.objectives.findOne({ where: { id } });
    if (!objective) throw new NotFoundException(`Objectif ${id} introuvable`);
    await this.objectives.remove(objective);
    return { ok: true };
  }

  // ── initiatives ──────────────────────────────────────────────────

  async listInitiatives(
    filter: ListInitiativesDto = {},
  ): Promise<RoadmapInitiativeView[]> {
    const where: FindOptionsWhere<RoadmapInitiative> = {};
    if (filter.status) where.status = filter.status;
    if (filter.quarter) where.quarter = filter.quarter;
    if (filter.objectiveId) where.objectiveId = filter.objectiveId;
    if (filter.appId) where.appId = filter.appId;
    if (filter.kind) where.kind = filter.kind;
    if (filter.owner) where.owner = filter.owner;

    const rows = await this.initiatives.find({
      where,
      order: { position: 'ASC', createdAt: 'ASC' },
    });
    return this.withProgress(rows);
  }

  /** Single initiative, hydrated with its milestones (checklist order). */
  async findInitiative(id: string): Promise<RoadmapInitiativeView> {
    const initiative = await this.initiatives.findOne({ where: { id } });
    if (!initiative) throw new NotFoundException(`Initiative ${id} introuvable`);
    const milestones = await this.milestones.find({
      where: { initiativeId: id },
      order: { position: 'ASC', createdAt: 'ASC' },
    });
    return { ...this.initiativeView(initiative, milestones), milestones };
  }

  async createInitiative(
    dto: CreateInitiativeDto,
  ): Promise<RoadmapInitiativeView> {
    if (dto.objectiveId) await this.assertObjectiveExists(dto.objectiveId);
    const now = new Date();
    const status = dto.status ?? 'idea';
    const initiative = this.initiatives.create({
      objectiveId: dto.objectiveId ?? null,
      title: dto.title,
      summary: dto.summary ?? null,
      kind: dto.kind ?? 'product',
      status,
      priority: dto.priority ?? 'P2',
      quarter: dto.quarter ?? null,
      startDate: dto.startDate ?? null,
      targetDate: dto.targetDate ?? null,
      owner: dto.owner ?? null,
      appId: dto.appId ?? null,
      tenantId: dto.tenantId ?? null,
      progress: dto.progress ?? 0,
      // Lands at the bottom of its column — a new card never jumps the queue.
      position: await this.initiatives.count({ where: { status } }),
      createdAt: now,
      updatedAt: now,
    });
    const saved = await this.initiatives.save(initiative);
    return this.initiativeView(saved, []);
  }

  async updateInitiative(
    id: string,
    dto: UpdateInitiativeDto,
  ): Promise<RoadmapInitiativeView> {
    const initiative = await this.initiatives.findOne({ where: { id } });
    if (!initiative) throw new NotFoundException(`Initiative ${id} introuvable`);
    if (dto.objectiveId) await this.assertObjectiveExists(dto.objectiveId);

    if (dto.objectiveId !== undefined)
      initiative.objectiveId = dto.objectiveId ?? null;
    if (dto.title !== undefined) initiative.title = dto.title;
    if (dto.summary !== undefined) initiative.summary = dto.summary ?? null;
    if (dto.kind !== undefined) initiative.kind = dto.kind;
    if (dto.status !== undefined) initiative.status = dto.status;
    if (dto.priority !== undefined) initiative.priority = dto.priority;
    if (dto.quarter !== undefined) initiative.quarter = dto.quarter ?? null;
    if (dto.startDate !== undefined) initiative.startDate = dto.startDate ?? null;
    if (dto.targetDate !== undefined)
      initiative.targetDate = dto.targetDate ?? null;
    if (dto.owner !== undefined) initiative.owner = dto.owner ?? null;
    if (dto.appId !== undefined) initiative.appId = dto.appId ?? null;
    if (dto.tenantId !== undefined) initiative.tenantId = dto.tenantId ?? null;
    if (dto.progress !== undefined) initiative.progress = dto.progress;
    initiative.updatedAt = new Date();

    const saved = await this.initiatives.save(initiative);
    return this.initiativeView(
      saved,
      await this.milestones.find({ where: { initiativeId: id } }),
    );
  }

  /**
   * Drag & drop on the board: places the initiative at `position` in the
   * `status` column and re-densifies both the target and (on a cross-column
   * move) the source column. Every touched row is saved in one `save([])`,
   * which TypeORM wraps in a single transaction — the board can never be
   * left with duplicate or gapped ranks.
   */
  async move(id: string, dto: MoveInitiativeDto): Promise<RoadmapInitiativeView> {
    const initiative = await this.initiatives.findOne({ where: { id } });
    if (!initiative) throw new NotFoundException(`Initiative ${id} introuvable`);

    // Only the two columns involved can change — no need to load the board.
    const columns = await this.initiatives.find({
      where: { status: In([initiative.status, dto.status]) },
    });
    const placements = planMove(columns, id, dto.status, dto.position ?? 0);

    if (placements.length > 0) {
      const now = new Date();
      const byId = new Map(columns.map((i) => [i.id, i]));
      const touched: RoadmapInitiative[] = [];
      for (const placement of placements) {
        const row = byId.get(placement.id);
        if (!row) continue;
        row.status = placement.status;
        row.position = placement.position;
        row.updatedAt = now;
        touched.push(row);
      }
      await this.initiatives.save(touched);
    }

    return this.initiativeView(
      initiative,
      await this.milestones.find({ where: { initiativeId: id } }),
    );
  }

  /** Deletes an initiative; its milestones go with it (FK ON DELETE CASCADE). */
  async removeInitiative(id: string) {
    const initiative = await this.initiatives.findOne({ where: { id } });
    if (!initiative) throw new NotFoundException(`Initiative ${id} introuvable`);
    await this.initiatives.remove(initiative);
    return { ok: true };
  }

  // ── milestones ───────────────────────────────────────────────────

  async addMilestone(
    initiativeId: string,
    dto: CreateMilestoneDto,
  ): Promise<RoadmapMilestone> {
    const exists = await this.initiatives.findOne({
      where: { id: initiativeId },
    });
    if (!exists)
      throw new NotFoundException(`Initiative ${initiativeId} introuvable`);

    const now = new Date();
    const milestone = this.milestones.create({
      initiativeId,
      title: dto.title,
      dueDate: dto.dueDate ?? null,
      done: dto.done ?? false,
      position:
        dto.position ?? (await this.milestones.count({ where: { initiativeId } })),
      createdAt: now,
      updatedAt: now,
    });
    return this.milestones.save(milestone);
  }

  async updateMilestone(
    id: string,
    dto: UpdateMilestoneDto,
  ): Promise<RoadmapMilestone> {
    const milestone = await this.milestones.findOne({ where: { id } });
    if (!milestone) throw new NotFoundException(`Jalon ${id} introuvable`);

    if (dto.title !== undefined) milestone.title = dto.title;
    if (dto.dueDate !== undefined) milestone.dueDate = dto.dueDate ?? null;
    if (dto.done !== undefined) milestone.done = dto.done;
    if (dto.position !== undefined) milestone.position = dto.position;
    milestone.updatedAt = new Date();

    return this.milestones.save(milestone);
  }

  async removeMilestone(id: string) {
    const milestone = await this.milestones.findOne({ where: { id } });
    if (!milestone) throw new NotFoundException(`Jalon ${id} introuvable`);
    await this.milestones.remove(milestone);
    return { ok: true };
  }

  // ── internals ────────────────────────────────────────────────────

  private async assertObjectiveExists(id: string) {
    const objective = await this.objectives.findOne({ where: { id } });
    if (!objective) throw new NotFoundException(`Objectif ${id} introuvable`);
  }

  /**
   * Hydrates the effective progress of a batch of initiatives. Milestones are
   * fetched in a single query for the whole batch (no N+1).
   */
  private async withProgress(
    initiatives: RoadmapInitiative[],
  ): Promise<RoadmapInitiativeView[]> {
    if (initiatives.length === 0) return [];
    const milestones = await this.milestones.find({
      where: { initiativeId: In(initiatives.map((i) => i.id)) },
    });
    const byInitiative = new Map<string, RoadmapMilestone[]>();
    for (const m of milestones) {
      const bucket = byInitiative.get(m.initiativeId);
      if (bucket) bucket.push(m);
      else byInitiative.set(m.initiativeId, [m]);
    }
    return initiatives.map((i) =>
      this.initiativeView(i, byInitiative.get(i.id) ?? []),
    );
  }

  private initiativeView(
    initiative: RoadmapInitiative,
    milestones: RoadmapMilestone[],
  ): RoadmapInitiativeView {
    return {
      ...initiative,
      progress: deriveInitiativeProgress(initiative.progress, milestones),
      milestoneCount: milestones.length,
      milestonesDone: milestones.filter((m) => m.done).length,
    };
  }

  private objectiveView(
    objective: RoadmapObjective,
    initiatives: RoadmapInitiativeView[],
  ): RoadmapObjectiveView {
    return {
      ...objective,
      progress: deriveObjectiveProgress(initiatives),
      initiativeCount: initiatives.length,
    };
  }
}
