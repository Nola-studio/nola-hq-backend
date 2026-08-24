import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { BusinessUnit } from '../company/business-unit.entity';
import { BusinessClient } from './business-client.entity';
import { BusinessOpportunity } from './business-opportunity.entity';
import { moneyTransformer } from './business-money';
import { DEFAULT_BUSINESS_CURRENCY, type BusinessCurrency } from './business-currency';

export const BUSINESS_CONTRACT_STATUSES = [
  'draft',
  'sent',
  'signed',
  'active',
  'completed',
  'cancelled',
] as const;
export type BusinessContractStatus = (typeof BUSINESS_CONTRACT_STATUSES)[number];

@Entity('business_contracts')
export class BusinessContract {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  number!: string;

  @Column({ type: 'uuid', name: 'client_id' })
  @Index()
  clientId!: string;

  @ManyToOne(() => BusinessClient, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'client_id' })
  client?: BusinessClient;

  @Column({ type: 'uuid', name: 'project_id', nullable: true })
  @Index()
  projectId!: string | null;

  @ManyToOne(() => RoadmapInitiative, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'project_id' })
  project?: RoadmapInitiative | null;

  @Column({ type: 'uuid', name: 'opportunity_id', nullable: true })
  @Index()
  opportunityId!: string | null;

  @ManyToOne(() => BusinessOpportunity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'opportunity_id' })
  opportunity?: BusinessOpportunity | null;

  /** Snapshotted at issuance — never derived live via `project`, so reassigning a project's brand later doesn't reprint this contract. */
  @Column({ type: 'uuid', name: 'business_unit_id' })
  @Index()
  businessUnitId!: string;

  @ManyToOne(() => BusinessUnit, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'business_unit_id' })
  businessUnit?: BusinessUnit;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'varchar', length: 24, default: 'draft' })
  @Index()
  status!: BusinessContractStatus;

  @Column({ type: 'bigint', name: 'value_cdf', default: 0, transformer: moneyTransformer })
  valueCdf!: number;

  @Column({ type: 'varchar', length: 3, name: 'value_currency', default: DEFAULT_BUSINESS_CURRENCY })
  valueCurrency!: BusinessCurrency;

  @Column({ type: 'date', name: 'start_date', nullable: true })
  startDate!: string | null;

  @Column({ type: 'date', name: 'end_date', nullable: true })
  endDate!: string | null;

  @Column({ type: 'timestamp', name: 'signed_at', nullable: true })
  signedAt!: Date | null;

  @Column({ type: 'varchar', length: 200, name: 'payment_terms', nullable: true })
  paymentTerms!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
