import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { WorkItem } from '../work-items/work-item.entity';
import { moneyTransformer } from './business-money';
import { DEFAULT_BUSINESS_CURRENCY, type BusinessCurrency } from './business-currency';

@Entity('project_time_entries')
export class ProjectTimeEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'project_id' })
  @Index()
  projectId!: string;

  @ManyToOne(() => RoadmapInitiative, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project?: RoadmapInitiative;

  @Column({ type: 'integer', name: 'work_item_id', nullable: true })
  @Index()
  workItemId!: number | null;

  @ManyToOne(() => WorkItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'work_item_id' })
  workItem?: WorkItem | null;

  @Column({ type: 'varchar', length: 160 })
  @Index()
  member!: string;

  @Column({ type: 'date', name: 'work_date' })
  @Index()
  workDate!: string;

  @Column({ type: 'integer' })
  minutes!: number;

  @Column({ type: 'boolean', default: true })
  billable!: boolean;

  @Column({ type: 'bigint', name: 'hourly_rate_cdf', default: 0, transformer: moneyTransformer })
  hourlyRateCdf!: number;

  @Column({ type: 'varchar', length: 3, name: 'hourly_rate_currency', default: DEFAULT_BUSINESS_CURRENCY })
  hourlyRateCurrency!: BusinessCurrency;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
