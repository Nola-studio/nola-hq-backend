import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { BusinessClient } from './business-client.entity';
import { BusinessContract } from './business-contract.entity';
import { moneyTransformer } from './business-money';

export const BUSINESS_INVOICE_STATUSES = [
  'draft',
  'sent',
  'partial',
  'paid',
  'overdue',
  'cancelled',
] as const;
export type BusinessInvoiceStatus = (typeof BUSINESS_INVOICE_STATUSES)[number];

@Entity('business_invoices')
export class BusinessInvoice {
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

  @Column({ type: 'bigint', name: 'amount_cdf', default: 0, transformer: moneyTransformer })
  amountCdf!: number;

  @Column({ type: 'bigint', name: 'paid_amount_cdf', default: 0, transformer: moneyTransformer })
  paidAmountCdf!: number;

  @Column({ type: 'date', name: 'issued_on' })
  issuedOn!: string;

  @Column({ type: 'date', name: 'due_on' })
  dueOn!: string;

  @Column({ type: 'timestamp', name: 'paid_at', nullable: true })
  paidAt!: Date | null;

  @Column({ type: 'varchar', length: 24, default: 'draft' })
  @Index()
  status!: BusinessInvoiceStatus;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
