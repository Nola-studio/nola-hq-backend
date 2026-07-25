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

  /** Rank inside the `status` kanban column (0-based, dense). */
  @Column({ type: 'integer', default: 0 })
  position!: number;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
