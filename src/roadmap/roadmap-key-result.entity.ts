import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RoadmapObjective } from './roadmap-objective.entity';
import type {
  KeyResultDirection,
  KeyResultUnit,
} from './roadmap.trajectory';

/**
 * A **key result**: how an objective is measured. `baseline` → `target` over
 * the objective's period, with a planned trajectory
 * (`roadmap_trajectory_points`) to compare the real curve against.
 *
 * Two flavours:
 *
 *   - **metric-bound** (`metricKey` set, one of `METRIC_KEYS`) — the actuals
 *     come from the `metric_snapshots` time series, nothing is entered by
 *     hand. `unit` and `direction` default from `METRIC_DEFS`.
 *   - **manual** (`metricKey` null) — the actuals are the `actualValue` of
 *     its trajectory points.
 *
 * Cascade-deleted with its objective: a measure has no meaning without the
 * goal it measures.
 */
@Entity('roadmap_key_results')
export class RoadmapKeyResult {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'objective_id' })
  @Index()
  objectiveId!: string;

  @ManyToOne(() => RoadmapObjective, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'objective_id' })
  objective?: RoadmapObjective;

  @Column({ type: 'varchar', length: 200 })
  label!: string;

  /**
   * Global metric feeding the actuals — one of `METRIC_KEYS`
   * (`src/analytics/snapshot.metrics.ts`). Null = manual key result.
   */
  @Column({ type: 'varchar', length: 64, name: 'metric_key', nullable: true })
  metricKey!: string | null;

  @Column({ type: 'varchar' })
  unit!: KeyResultUnit;

  /** Value at the start of the period — the 0% of the progress scale. */
  @Column({ type: 'real' })
  baseline!: number;

  /** Value that means 100%. */
  @Column({ type: 'real' })
  target!: number;

  /** `up` (target above baseline) or `down` (churn, délais…). */
  @Column({ type: 'varchar' })
  direction!: KeyResultDirection;

  /** Rank inside the objective's key result list (0-based). */
  @Column({ type: 'integer', default: 0 })
  position!: number;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
