import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type RoadmapObjectiveStatus =
  | 'draft'
  | 'active'
  | 'achieved'
  | 'missed'
  | 'dropped';

/**
 * Top level of the studio roadmap: a **quarterly objective** (startup
 * strategy). Objectives group initiatives; initiatives group milestones.
 *
 * This is Nola Studio's own planning tool — it has nothing to do with a
 * tenant's data. No NATS involvement, purely DB-backed.
 *
 * `progress` is a *stored* fallback: the API always answers with the value
 * derived from the linked initiatives (`deriveObjectiveProgress`), which is
 * 0 while the objective has none. See `roadmap.progress.ts`.
 */
@Entity('roadmap_objectives')
export class RoadmapObjective {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

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

  /** 0..100. Manual fallback; the read model derives it from initiatives. */
  @Column({ type: 'integer', default: 0 })
  progress!: number;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
