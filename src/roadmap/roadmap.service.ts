import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, LessThanOrEqual, Repository } from 'typeorm';
import { RoadmapObjective } from './roadmap-objective.entity';
import { RoadmapInitiative } from './roadmap-initiative.entity';
import { RoadmapMilestone } from './roadmap-milestone.entity';
import { RoadmapKeyResult } from './roadmap-key-result.entity';
import { RoadmapTrajectoryPoint } from './roadmap-trajectory-point.entity';
import { MetricSnapshot } from '../analytics/metric-snapshot.entity';
import { METRIC_DEFS, MetricDef } from '../analytics/snapshot.metrics';
import {
  RoadmapBoardColumn,
  RoadmapTimelineBucket,
  buildBoard,
  buildTimeline,
  planMove,
} from './roadmap.board';
import { deriveInitiativeProgress } from './roadmap.progress';
import {
  CascadeObjective,
  KeyResultComputed,
  KeyResultSeries,
  KeyResultUnit,
  KeyResultDirection,
  buildKeyResultSeries,
  computeKeyResult,
  defaultsForMetric,
  deriveCascadedObjectiveProgress,
} from './roadmap.trajectory';
import { CreateObjectiveDto } from './dto/create-objective.dto';
import { UpdateObjectiveDto } from './dto/update-objective.dto';
import { CreateInitiativeDto } from './dto/create-initiative.dto';
import { UpdateInitiativeDto } from './dto/update-initiative.dto';
import { MoveInitiativeDto } from './dto/move-initiative.dto';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
import { CreateKeyResultDto } from './dto/create-key-result.dto';
import { UpdateKeyResultDto } from './dto/update-key-result.dto';
import { CreateTrajectoryPointDto } from './dto/create-trajectory-point.dto';
import { UpdateTrajectoryPointDto } from './dto/update-trajectory-point.dto';
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
 * A key result as the API returns it: the stored plan plus the measured
 * reality (`current`, `progress`, `plannedToday`, `status`), all derived at
 * read time by `roadmap.trajectory.ts`.
 */
export interface RoadmapKeyResultView
  extends RoadmapKeyResult,
    KeyResultComputed {}

/**
 * An objective as the API returns it: the stored row plus its effective
 * progress (cf. `deriveCascadedObjectiveProgress`) and the counters the UI
 * renders.
 */
export interface RoadmapObjectiveView extends RoadmapObjective {
  initiativeCount: number;
  keyResultCount: number;
  /** Only hydrated by `findObjective`. */
  initiatives?: RoadmapInitiativeView[];
  keyResults?: RoadmapKeyResultView[];
  /** Quarterly objectives serving this one — only on the detail route. */
  children?: RoadmapObjectiveView[];
}

/** `GET /roadmap/key-results/:id/series` — what the console charts. */
export interface RoadmapKeyResultSeries extends KeyResultSeries {
  baseline: number;
  target: number;
  unit: KeyResultUnit;
  direction: KeyResultDirection;
}

/**
 * Everything the objective read model needs, loaded **once** for a batch of
 * objectives (and their children) — no N+1 anywhere on the list routes.
 */
interface ObjectiveContext {
  view(objective: RoadmapObjective): RoadmapObjectiveView;
  initiativesOf(id: string): RoadmapInitiativeView[];
  keyResultsOf(id: string): RoadmapKeyResultView[];
  childrenOf(id: string): RoadmapObjective[];
}

/**
 * Nola Studio's own strategy tool: **objectives** (annual → quarterly) →
 * **key results** (measures) and **initiatives** (projects/workstreams) →
 * **milestones** (execution checkpoints).
 *
 * Purely DB-backed — no NATS, no tenant coupling. All percentage/trajectory
 * arithmetic lives in `roadmap.progress.ts` and `roadmap.trajectory.ts`, all
 * grouping/ordering in `roadmap.board.ts`; this service only fetches and
 * persists.
 *
 * Progress is **derived at read time** and never written back: an
 * initiative's stored `progress` stays the operator-set fallback used while
 * it has no milestone, and an objective's stored `progress` is the fallback
 * used while it carries nothing measurable.
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
    @InjectRepository(RoadmapKeyResult)
    private readonly keyResults: Repository<RoadmapKeyResult>,
    @InjectRepository(RoadmapTrajectoryPoint)
    private readonly points: Repository<RoadmapTrajectoryPoint>,
    @InjectRepository(MetricSnapshot)
    private readonly snapshots: Repository<MetricSnapshot>,
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

  /**
   * The seven global metrics a key result can bind to — served straight from
   * `METRIC_DEFS` so the console never hardcodes the keys.
   */
  metrics(): MetricDef[] {
    return METRIC_DEFS;
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

    const ctx = await this.objectiveContext(rows);
    return rows.map((o) => ctx.view(o));
  }

  /**
   * Single objective, hydrated with its key results (measured fields
   * included), its initiatives and — for an annual one — its children.
   */
  async findObjective(id: string): Promise<RoadmapObjectiveView> {
    const objective = await this.objectives.findOne({ where: { id } });
    if (!objective) throw new NotFoundException(`Objectif ${id} introuvable`);
    const ctx = await this.objectiveContext([objective]);
    return {
      ...ctx.view(objective),
      initiatives: ctx.initiativesOf(id),
      keyResults: ctx.keyResultsOf(id),
      children: ctx.childrenOf(id).map((c) => ctx.view(c)),
    };
  }

  async createObjective(dto: CreateObjectiveDto): Promise<RoadmapObjectiveView> {
    this.assertHorizon(dto.year ?? null, dto.quarter ?? null);
    if (dto.parentId) await this.assertParentAllowed(null, dto.parentId);

    const now = new Date();
    const objective = this.objectives.create({
      title: dto.title,
      description: dto.description ?? null,
      parentId: dto.parentId ?? null,
      year: dto.year ?? null,
      quarter: dto.quarter ?? null,
      status: dto.status ?? 'draft',
      owner: dto.owner ?? null,
      progress: dto.progress ?? 0,
      createdAt: now,
      updatedAt: now,
    });
    const saved = await this.objectives.save(objective);
    const ctx = await this.objectiveContext([saved]);
    return ctx.view(saved);
  }

  async updateObjective(
    id: string,
    dto: UpdateObjectiveDto,
  ): Promise<RoadmapObjectiveView> {
    const objective = await this.objectives.findOne({ where: { id } });
    if (!objective) throw new NotFoundException(`Objectif ${id} introuvable`);

    // Both invariants are checked against the **resulting** state, not the
    // payload: a PATCH that only sets `year` must still be rejected if the
    // row already carries a quarter.
    const year = dto.year !== undefined ? (dto.year ?? null) : objective.year;
    const quarter =
      dto.quarter !== undefined ? (dto.quarter ?? null) : objective.quarter;
    this.assertHorizon(year, quarter);
    if (dto.parentId) await this.assertParentAllowed(id, dto.parentId);

    if (dto.title !== undefined) objective.title = dto.title;
    if (dto.description !== undefined)
      objective.description = dto.description ?? null;
    if (dto.parentId !== undefined) objective.parentId = dto.parentId ?? null;
    objective.year = year;
    objective.quarter = quarter;
    if (dto.status !== undefined) objective.status = dto.status;
    if (dto.owner !== undefined) objective.owner = dto.owner ?? null;
    if (dto.progress !== undefined) objective.progress = dto.progress;
    objective.updatedAt = new Date();

    const saved = await this.objectives.save(objective);
    const ctx = await this.objectiveContext([saved]);
    return ctx.view(saved);
  }

  /**
   * Deletes an objective. Its initiatives are **kept** and detached
   * (`objective_id` → NULL by FK) and so are its quarterly children
   * (`parent_id` → NULL) — deleting a strategic goal must never silently
   * drop the work that was done under it. Its key results, on the other
   * hand, go with it (they only measure *that* goal).
   */
  async removeObjective(id: string) {
    const objective = await this.objectives.findOne({ where: { id } });
    if (!objective) throw new NotFoundException(`Objectif ${id} introuvable`);
    await this.objectives.remove(objective);
    return { ok: true };
  }

  // ── key results ──────────────────────────────────────────────────

  /** The objective's key results, with their measured fields. */
  async listKeyResults(objectiveId: string): Promise<RoadmapKeyResultView[]> {
    await this.assertObjectiveExists(objectiveId);
    return this.withMeasures(
      await this.keyResults.find({
        where: { objectiveId },
        order: { position: 'ASC', createdAt: 'ASC' },
      }),
    );
  }

  async createKeyResult(
    objectiveId: string,
    dto: CreateKeyResultDto,
  ): Promise<RoadmapKeyResultView> {
    await this.assertObjectiveExists(objectiveId);

    // A metric-bound key result inherits the metric's own unit and reading
    // direction (churn inverts) unless the operator overrode them.
    const defaults = defaultsForMetric(dto.metricKey ?? null);
    const now = new Date();
    const keyResult = this.keyResults.create({
      objectiveId,
      label: dto.label,
      metricKey: dto.metricKey ?? null,
      unit: dto.unit ?? defaults?.unit ?? 'raw',
      baseline: dto.baseline,
      target: dto.target,
      direction:
        dto.direction ??
        defaults?.direction ??
        // No metric to inherit from: the plan itself says where we're going.
        (dto.target < dto.baseline ? 'down' : 'up'),
      position:
        dto.position ?? (await this.keyResults.count({ where: { objectiveId } })),
      createdAt: now,
      updatedAt: now,
    });
    const saved = await this.keyResults.save(keyResult);
    const [view] = await this.withMeasures([saved]);
    return view;
  }

  async updateKeyResult(
    id: string,
    dto: UpdateKeyResultDto,
  ): Promise<RoadmapKeyResultView> {
    const keyResult = await this.keyResults.findOne({ where: { id } });
    if (!keyResult) throw new NotFoundException(`Key result ${id} introuvable`);

    if (dto.label !== undefined) keyResult.label = dto.label;
    if (dto.metricKey !== undefined) {
      keyResult.metricKey = dto.metricKey ?? null;
      // (Re)binding to a metric re-applies its unit/direction, unless the
      // same payload sets them explicitly.
      const defaults = defaultsForMetric(keyResult.metricKey);
      if (defaults) {
        keyResult.unit = dto.unit ?? defaults.unit;
        keyResult.direction = dto.direction ?? defaults.direction;
      }
    }
    if (dto.unit !== undefined) keyResult.unit = dto.unit;
    if (dto.baseline !== undefined) keyResult.baseline = dto.baseline;
    if (dto.target !== undefined) keyResult.target = dto.target;
    if (dto.direction !== undefined) keyResult.direction = dto.direction;
    if (dto.position !== undefined) keyResult.position = dto.position;
    keyResult.updatedAt = new Date();

    const saved = await this.keyResults.save(keyResult);
    const [view] = await this.withMeasures([saved]);
    return view;
  }

  /** Deletes a key result; its trajectory points go with it (FK CASCADE). */
  async removeKeyResult(id: string) {
    const keyResult = await this.keyResults.findOne({ where: { id } });
    if (!keyResult) throw new NotFoundException(`Key result ${id} introuvable`);
    await this.keyResults.remove(keyResult);
    return { ok: true };
  }

  /**
   * The two curves the console charts: the declared/planned target points and
   * the measured ones (`metric_snapshots` for a metric-bound key result, the
   * points' `actualValue` otherwise). Both sorted by date ascending.
   */
  async keyResultSeries(id: string): Promise<RoadmapKeyResultSeries> {
    const keyResult = await this.keyResults.findOne({ where: { id } });
    if (!keyResult) throw new NotFoundException(`Key result ${id} introuvable`);

    const points = await this.points.find({ where: { keyResultId: id } });
    const snapshots = keyResult.metricKey
      ? await this.snapshots.find({
          where: { metricKey: keyResult.metricKey },
          order: { date: 'ASC' },
        })
      : [];

    return {
      ...buildKeyResultSeries(keyResult, points, snapshots),
      baseline: keyResult.baseline,
      target: keyResult.target,
      unit: keyResult.unit,
      direction: keyResult.direction,
    };
  }

  // ── trajectory points ────────────────────────────────────────────

  /**
   * Adds a step to the planned trajectory. One point per date: posting a date
   * the key result already plans **updates** it instead of tripping the
   * unique constraint (re-planning is the normal operation).
   */
  async addTrajectoryPoint(
    keyResultId: string,
    dto: CreateTrajectoryPointDto,
  ): Promise<RoadmapTrajectoryPoint> {
    const exists = await this.keyResults.findOne({ where: { id: keyResultId } });
    if (!exists)
      throw new NotFoundException(`Key result ${keyResultId} introuvable`);

    const now = new Date();
    const existing = await this.points.findOne({
      where: { keyResultId, date: dto.date },
    });
    const point =
      existing ??
      this.points.create({
        keyResultId,
        date: dto.date,
        targetValue: null,
        actualValue: null,
        note: null,
        createdAt: now,
      });
    if (dto.targetValue !== undefined) point.targetValue = dto.targetValue ?? null;
    if (dto.actualValue !== undefined) point.actualValue = dto.actualValue ?? null;
    if (dto.note !== undefined) point.note = dto.note ?? null;
    point.updatedAt = now;

    return this.points.save(point);
  }

  async updateTrajectoryPoint(
    id: string,
    dto: UpdateTrajectoryPointDto,
  ): Promise<RoadmapTrajectoryPoint> {
    const point = await this.points.findOne({ where: { id } });
    if (!point) throw new NotFoundException(`Point de trajectoire ${id} introuvable`);

    if (dto.date !== undefined && dto.date !== point.date) {
      const clash = await this.points.findOne({
        where: { keyResultId: point.keyResultId, date: dto.date },
      });
      if (clash)
        throw new ConflictException(
          `Un point existe déjà au ${dto.date} pour ce key result`,
        );
      point.date = dto.date;
    }
    if (dto.targetValue !== undefined) point.targetValue = dto.targetValue ?? null;
    if (dto.actualValue !== undefined) point.actualValue = dto.actualValue ?? null;
    if (dto.note !== undefined) point.note = dto.note ?? null;
    point.updatedAt = new Date();

    return this.points.save(point);
  }

  async removeTrajectoryPoint(id: string) {
    const point = await this.points.findOne({ where: { id } });
    if (!point) throw new NotFoundException(`Point de trajectoire ${id} introuvable`);
    await this.points.remove(point);
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
      color: dto.color ?? '#94A3B8',
      healthStatus: dto.healthStatus ?? null,
      type: dto.type ?? null,
      keyPrefix: dto.keyPrefix ?? null,
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
    if (dto.color !== undefined) initiative.color = dto.color;
    if (dto.healthStatus !== undefined) initiative.healthStatus = dto.healthStatus ?? null;
    if (dto.type !== undefined) initiative.type = dto.type ?? null;
    if (dto.keyPrefix !== undefined) initiative.keyPrefix = dto.keyPrefix ?? null;
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

  /** An objective plans a year **or** a quarter — never both. */
  private assertHorizon(year: string | null, quarter: string | null) {
    if (year && quarter)
      throw new BadRequestException(
        'Un objectif porte une année (annuel) ou un trimestre, pas les deux',
      );
  }

  /**
   * Guards the staged cascade: **annual → quarterly only**.
   *
   * Three rejections, and they are exhaustive — a cycle needs a chain of at
   * least two edges, which the depth rules below already forbid:
   *   1. an objective cannot be its own parent;
   *   2. the parent must not itself have a parent (that would be a 3rd level);
   *   3. an objective that already has children cannot become a child.
   *
   * `id` is null on create (the row does not exist yet, so rules 1 and 3
   * cannot apply).
   */
  private async assertParentAllowed(id: string | null, parentId: string) {
    if (id && parentId === id)
      throw new BadRequestException(
        'Un objectif ne peut pas être son propre parent',
      );

    const parent = await this.objectives.findOne({ where: { id: parentId } });
    if (!parent)
      throw new NotFoundException(`Objectif parent ${parentId} introuvable`);
    if (parent.parentId)
      throw new BadRequestException(
        'Cascade limitée à deux niveaux : le parent est déjà rattaché à un objectif annuel',
      );

    if (id) {
      const children = await this.objectives.count({ where: { parentId: id } });
      if (children > 0)
        throw new BadRequestException(
          'Cascade limitée à deux niveaux : cet objectif porte déjà des objectifs trimestriels',
        );
    }
  }

  /**
   * Loads, in a handful of batched queries, everything the objective read
   * model needs for `rows`: their initiatives (with derived progress), their
   * key results (with measured fields) and their children — plus the same
   * for those children, so the annual cascade has real numbers to average.
   */
  private async objectiveContext(
    rows: RoadmapObjective[],
  ): Promise<ObjectiveContext> {
    const ids = rows.map((o) => o.id);
    const children = ids.length
      ? await this.objectives.find({ where: { parentId: In(ids) } })
      : [];

    // A listed row can itself be the child of another listed row — dedupe.
    const byId = new Map<string, RoadmapObjective>();
    for (const o of [...rows, ...children]) byId.set(o.id, o);
    const allIds = [...byId.keys()];

    const [initiatives, keyResults] = await Promise.all([
      allIds.length
        ? this.initiatives.find({
            where: { objectiveId: In(allIds) },
            order: { position: 'ASC', createdAt: 'ASC' },
          })
        : Promise.resolve([]),
      allIds.length
        ? this.keyResults.find({
            where: { objectiveId: In(allIds) },
            order: { position: 'ASC', createdAt: 'ASC' },
          })
        : Promise.resolve([]),
    ]);

    const initiativesByObjective = groupBy(
      await this.withProgress(initiatives),
      (i) => i.objectiveId ?? '',
    );
    const keyResultsByObjective = groupBy(
      await this.withMeasures(keyResults),
      (k) => k.objectiveId,
    );
    const childrenByParent = groupBy(
      [...byId.values()].filter((o) => o.parentId),
      (o) => o.parentId as string,
    );

    const initiativesOf = (id: string) => initiativesByObjective.get(id) ?? [];
    const keyResultsOf = (id: string) => keyResultsByObjective.get(id) ?? [];
    const childrenOf = (id: string) => childrenByParent.get(id) ?? [];

    /** One node of the cascade; `depth` stops at the quarterly level. */
    const node = (o: RoadmapObjective, depth: number): CascadeObjective => ({
      stored: o.progress,
      keyResults: keyResultsOf(o.id).map((k) => k.progress),
      initiatives: initiativesOf(o.id),
      children: depth === 0 ? childrenOf(o.id).map((c) => node(c, 1)) : [],
    });

    return {
      initiativesOf,
      keyResultsOf,
      childrenOf,
      view: (objective) => ({
        ...objective,
        progress: deriveCascadedObjectiveProgress(node(objective, 0)),
        initiativeCount: initiativesOf(objective.id).length,
        keyResultCount: keyResultsOf(objective.id).length,
      }),
    };
  }

  /**
   * Hydrates the measured fields of a batch of key results. Trajectory points
   * and metric snapshots are each fetched in a single query for the whole
   * batch (no N+1).
   */
  private async withMeasures(
    keyResults: RoadmapKeyResult[],
  ): Promise<RoadmapKeyResultView[]> {
    if (keyResults.length === 0) return [];
    const today = new Date().toISOString().slice(0, 10);

    const metricKeys = [
      ...new Set(
        keyResults
          .map((k) => k.metricKey)
          .filter((k): k is string => typeof k === 'string' && k.length > 0),
      ),
    ];
    const [points, snapshots] = await Promise.all([
      this.points.find({
        where: { keyResultId: In(keyResults.map((k) => k.id)) },
      }),
      metricKeys.length
        ? this.snapshots.find({
            where: { metricKey: In(metricKeys), date: LessThanOrEqual(today) },
          })
        : Promise.resolve([]),
    ]);

    const pointsByKeyResult = groupBy(points, (p) => p.keyResultId);
    const snapshotsByMetric = groupBy(snapshots, (s) => s.metricKey);

    return keyResults.map((k) => ({
      ...k,
      ...computeKeyResult(
        k,
        pointsByKeyResult.get(k.id) ?? [],
        k.metricKey ? (snapshotsByMetric.get(k.metricKey) ?? []) : [],
        today,
      ),
    }));
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
    const byInitiative = groupBy(milestones, (m) => m.initiativeId);
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
}

/** Groups a flat batch by key, preserving the query's ordering. */
function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
}
