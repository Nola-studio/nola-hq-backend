import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type RoadmapObjectiveStatus =
  | 'draft'
  | 'active'
  | 'achieved'
  | 'missed'
  | 'dropped';

/**
 * Top level of the studio roadmap: an **objective** (startup strategy).
 * Objectives group key results and initiatives; initiatives group milestones.
 *
 * Objectives are **staged**: an objective carrying a `year` (and no
 * `quarter`) is an *annual* objective, and the quarterly ones that serve it
 * point at it through `parentId`. The horizon is derivable from those two
 * columns — there is deliberately no `horizon` enum to keep in sync. The
 * cascade is capped at two levels (annual → quarterly) at write time.
 *
 * This is Nola Studio's own planning tool — it has nothing to do with a
 * tenant's data. No NATS involvement, purely DB-backed.
 *
 * `progress` is a *stored* fallback of last resort: the API answers with the
 * value derived from the key results, else the children, else the
 * initiatives (`deriveCascadedObjectiveProgress`, `roadmap.trajectory.ts`).
 */
@Entity('roadmap_objectives')
export class RoadmapObjective {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /**
   * Annual objective this one serves. `ON DELETE SET NULL`: dropping the
   * yearly goal must never delete the quarterly work planned under it.
   */
  @Column({ type: 'uuid', name: 'parent_id', nullable: true })
  @Index()
  parentId!: string | null;

  @ManyToOne(() => RoadmapObjective, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_id' })
  parent?: RoadmapObjective | null;

  /** `YYYY` — set (with `quarter` null) on an **annual** objective. */
  @Column({ type: 'varchar', length: 4, nullable: true })
  year!: string | null;

  /** Target quarter in `YYYY-Qn` (e.g. `2026-Q3`). Null = not scheduled yet. */
  @Column({ type: 'varchar', length: 7, nullable: true })
  @Index()
  quarter!: string | null;

  @Column({ type: 'varchar', default: 'draft' })
  @Index()
  status!: RoadmapObjectiveStatus;

  /**
   * Accountable team member — their `team_members.email`. Soft reference on
   * purpose (no FK): an objective survives the departure of its owner.
   */
  @Column({ type: 'varchar', length: 120, nullable: true })
  owner!: string | null;

  /** 0..100. Manual fallback; the read model derives it (cf. the cascade). */
  @Column({ type: 'integer', default: 0 })
  progress!: number;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;

  /**
   * Functional domain and capability (§4A). Nullable: the referential's
   * twelve domains were seeded before anything was classified, and
   * classification happens domain by domain.
   */
  @Column({ type: 'uuid', name: 'domain_id', nullable: true })
  @Index()
  domainId!: string | null;

  @Column({ type: 'uuid', name: 'capability_id', nullable: true })
  capabilityId!: string | null;
}
