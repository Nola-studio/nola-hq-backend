import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RoadmapObjective } from './roadmap-objective.entity';

export type RoadmapInitiativeKind = 'product' | 'tech' | 'gtm' | 'ops';
export type RoadmapInitiativeStatus =
  | 'idea'
  | 'planned'
  | 'in_progress'
  | 'shipped'
  | 'dropped';
export type RoadmapInitiativePriority = 'P0' | 'P1' | 'P2' | 'P3';

/** Operational project type (distinct from `kind`, the strategic classification). */
export type RoadmapInitiativeType =
  | 'infrastructure_cloud'
  | 'web_app_development'
  | 'mobile_app_development'
  | 'website'
  | 'administrative'
  | 'maintenance_support'
  | 'other';
/** Project *health*, distinct from the `status` lifecycle. */
export type RoadmapInitiativeHealthStatus = 'on_track' | 'on_hold' | 'behind' | 'completed';

/** Where the project operates. Plain varchar (not a DB enum) so a third country is a code change, not a migration. */
export type RoadmapInitiativeCountry = 'CA' | 'CD';

/**
 * Middle level of the roadmap: a **project / workstream** that serves an
 * objective. Initiatives are what the kanban board (`GET /roadmap/board`)
 * and the timeline (`GET /roadmap/timeline`) render.
 *
 * `position` orders the initiative inside its own status column; the whole
 * column is re-densified on every `POST /roadmap/initiatives/:id/move`.
 */
@Entity('roadmap_initiatives')
export class RoadmapInitiative {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Parent objective. Detaching an objective orphans (not deletes) its work. */
  @Column({ type: 'uuid', name: 'objective_id', nullable: true })
  @Index()
  objectiveId!: string | null;

  @ManyToOne(() => RoadmapObjective, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'objective_id' })
  objective?: RoadmapObjective | null;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  @Column({ type: 'varchar', default: 'product' })
  kind!: RoadmapInitiativeKind;

  @Column({ type: 'varchar', default: 'idea' })
  @Index()
  status!: RoadmapInitiativeStatus;

  @Column({ type: 'varchar', default: 'P2' })
  priority!: RoadmapInitiativePriority;

  /** Hex, e.g. `#4F46E5` — used to colour this project across dashboards. */
  @Column({ type: 'varchar', length: 7, default: '#94A3B8' })
  color!: string;

  /** Health (On Track / On Hold / Behind / Completed) — not the `status` lifecycle. */
  @Column({ type: 'varchar', name: 'health_status', nullable: true })
  healthStatus!: RoadmapInitiativeHealthStatus | null;

  /** Operational project type — distinct from `kind`. */
  @Column({ type: 'varchar', nullable: true })
  type!: RoadmapInitiativeType | null;

  /**
   * Immutable, auto-generated from `title` at creation time (accents/spaces
   * stripped, deduplicated with a numeric suffix on collision) — never
   * typed by a user. Tasks filed under this initiative build their
   * reference from it: project id is `P<keyPrefix>`, task references are
   * `T<keyPrefix><NN>` (see `roadmap-identifier.ts`). Legacy rows created
   * before this convention may still hold an old hand-typed value (e.g.
   * `YEK`) — left as-is. Rows that had no value at all were backfilled once
   * by `1786900000000-BackfillNullKeyPrefixes`; every reader must still
   * treat this as nullable (`WorkItemsService.projectPrefix()`, the Studio
   * project list's sort/display) since that backfill can't be guaranteed to
   * have run against every environment. Not a reuse of `appId`, a soft
   * reference into the apps registry, unrelated to identifiers.
   */
  @Column({ type: 'varchar', length: 12, name: 'key_prefix', nullable: true })
  keyPrefix!: string | null;

  /** Target quarter in `YYYY-Qn`. Null lands in the timeline's "unscheduled". */
  @Column({ type: 'varchar', length: 7, nullable: true })
  @Index()
  quarter!: string | null;

  /** `YYYY-MM-DD` — TypeORM hands `date` columns back as strings. */
  @Column({ type: 'date', name: 'start_date', nullable: true })
  startDate!: string | null;

  @Column({ type: 'date', name: 'target_date', nullable: true })
  targetDate!: string | null;

  /** Accountable team member — their `team_members.email` (soft reference). */
  @Column({ type: 'varchar', length: 120, nullable: true })
  owner!: string | null;

  /**
   * App the initiative ships in (`kelasi`, `kriver`, …). Soft reference: the
   * apps registry is an in-memory JetStream projection (cf. `AppsService`),
   * it has no table, so a FK is impossible. Stored as-is, never validated.
   */
  @Column({ type: 'varchar', length: 64, name: 'app_id', nullable: true })
  appId!: string | null;

  /**
   * Tenant the initiative is driven by, when it is customer-specific.
   * Deliberately no FK — the roadmap must stay decoupled from the tenant
   * lifecycle (and the canonical tenant record lives in nola-billing).
   */
  @Column({ type: 'varchar', name: 'tenant_id', nullable: true })
  tenantId!: string | null;

  /** 0..100. Used as-is only while the initiative has no milestone. */
  @Column({ type: 'integer', default: 0 })
  progress!: number;

  /**
   * USD, no currency column. `numeric` columns come back from TypeORM as
   * strings (same convention as `WorkItem.hoursSpent`) — never `number`.
   */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  budget!: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  cost!: string | null;

  /** ISO 3166-1 alpha-2. Just Canada/DRC today — see `RoadmapInitiativeCountry`. */
  @Column({ type: 'varchar', length: 2, nullable: true })
  country!: RoadmapInitiativeCountry | null;

  /** Rank inside the `status` kanban column (0-based, dense). */
  @Column({ type: 'integer', default: 0 })
  position!: number;

  /**
   * Retired from the Studio project picker without deleting the row (its
   * `keyPrefix` may still be referenced by historical work items). Distinct
   * from `status` — a `shipped`/`dropped` initiative can still be archived
   * or not; this is Studio's own on/off toggle, absorbed from
   * `studio_projects.status`.
   */
  @Column({ type: 'boolean', default: false })
  archived!: boolean;

  /**
   * Per-project monotonic counter backing auto-generated work item
   * references (`T<keyPrefix><NN>`). Only ever incremented — a deleted
   * task's number is never reused.
   */
  @Column({ type: 'integer', name: 'task_seq', default: 0 })
  taskSeq!: number;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
