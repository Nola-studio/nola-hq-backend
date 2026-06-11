import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One daily data point per global metric. Append-only history that powers the
 * real sparklines on the Finance / Dashboard / NPS views — captured by the
 * SnapshotsService cron (forward-only; there's no past state to backfill).
 * The (metricKey, date) pair is unique so the daily capture is idempotent.
 */
@Entity('metric_snapshots')
@Index(['metricKey', 'date'], { unique: true })
export class MetricSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  @Index()
  metricKey!: string;

  /** Calendar day in `YYYY-MM-DD` (UTC). */
  @Column({ type: 'varchar' })
  date!: string;

  @Column({ type: 'real' })
  value!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
