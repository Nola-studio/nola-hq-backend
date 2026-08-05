import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { BusinessContract } from './business-contract.entity';
import { moneyTransformer } from './business-money';

export const BUSINESS_EXPENSE_STATUSES = ['planned', 'approved', 'paid', 'rejected'] as const;
export type BusinessExpenseStatus = (typeof BUSINESS_EXPENSE_STATUSES)[number];

@Entity('business_expenses')
export class BusinessExpense {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'project_id' })
  @Index()
  projectId!: string;

  @ManyToOne(() => RoadmapInitiative, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project?: RoadmapInitiative;

  @Column({ type: 'uuid', name: 'contract_id', nullable: true })
  @Index()
  contractId!: string | null;

  @ManyToOne(() => BusinessContract, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'contract_id' })
  contract?: BusinessContract | null;

  @Column({ type: 'varchar', length: 160 })
  label!: string;

  @Column({ type: 'varchar', length: 80, default: 'other' })
  category!: string;

  @Column({ type: 'bigint', name: 'amount_cdf', default: 0, transformer: moneyTransformer })
  amountCdf!: number;

  @Column({ type: 'date', name: 'incurred_on' })
  incurredOn!: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  vendor!: string | null;

  @Column({ type: 'varchar', length: 24, default: 'planned' })
  @Index()
  status!: BusinessExpenseStatus;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
