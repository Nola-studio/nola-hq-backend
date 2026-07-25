import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RoadmapKeyResult } from './roadmap-key-result.entity';

/**
 * One point of a key result's **planned trajectory**: "on that date, we
 * intend to be at that value". `plannedValueAt` interpolates linearly between
 * two consecutive points, which is what makes an on-track / at-risk verdict
 * possible mid-quarter instead of only at the deadline.
 *
 * `actualValue` is the manual counterpart — it is only read for key results
 * that have **no** `metricKey` (a metric-bound key result takes its actuals
 * from `metric_snapshots`).
 *
 * One point per (key result, date): re-planning a date updates it in place.
 * Cascade-deleted with its key result.
 */
@Entity('roadmap_trajectory_points')
@Index(['keyResultId', 'date'], { unique: true })
export class RoadmapTrajectoryPoint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'key_result_id' })
  @Index()
  keyResultId!: string;

  @ManyToOne(() => RoadmapKeyResult, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'key_result_id' })
  keyResult?: RoadmapKeyResult;

  /** `YYYY-MM-DD` — TypeORM hands `date` columns back as strings. */
  @Column({ type: 'date' })
  date!: string;

  /** PLANNED value at that date. */
  @Column({ type: 'real', name: 'target_value', nullable: true })
  targetValue!: number | null;

  /** Measured value — ignored when the key result is metric-bound. */
  @Column({ type: 'real', name: 'actual_value', nullable: true })
  actualValue!: number | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
