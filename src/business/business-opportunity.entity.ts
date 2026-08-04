import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { BusinessClient } from './business-client.entity';
import { moneyTransformer } from './business-money';

export const BUSINESS_OPPORTUNITY_STAGES = [
  'lead',
  'qualified',
  'proposal',
  'negotiation',
  'won',
  'lost',
] as const;
export type BusinessOpportunityStage = (typeof BUSINESS_OPPORTUNITY_STAGES)[number];

@Entity('business_opportunities')
export class BusinessOpportunity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'client_id' })
  @Index()
  clientId!: string;

  @ManyToOne(() => BusinessClient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client?: BusinessClient;

  @Column({ type: 'uuid', name: 'project_id', nullable: true })
  @Index()
  projectId!: string | null;

  @ManyToOne(() => RoadmapInitiative, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'project_id' })
  project?: RoadmapInitiative | null;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'varchar', length: 24, default: 'lead' })
  @Index()
  stage!: BusinessOpportunityStage;

  @Column({ type: 'bigint', name: 'value_cdf', default: 0, transformer: moneyTransformer })
  valueCdf!: number;

  @Column({ type: 'integer', default: 10 })
  probability!: number;

  @Column({ type: 'date', name: 'expected_close_date', nullable: true })
  expectedCloseDate!: string | null;

  @Column({ type: 'text', name: 'next_step', nullable: true })
  nextStep!: string | null;

  @Column({ type: 'text', name: 'loss_reason', nullable: true })
  lossReason!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  owner!: string | null;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
