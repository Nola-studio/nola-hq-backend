import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { BusinessClient } from './business-client.entity';
import { BusinessContract } from './business-contract.entity';
import { moneyTransformer } from './business-money';
import { DEFAULT_BUSINESS_CURRENCY, type BusinessCurrency } from './business-currency';

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

  /** One currency for both `amountCdf` and `paidAmountCdf` — they're the same money in two states. */
  @Column({ type: 'varchar', length: 3, default: DEFAULT_BUSINESS_CURRENCY })
  currency!: BusinessCurrency;

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

  @OneToMany(() => BusinessInvoiceLine, (line) => line.invoice)
  lines?: BusinessInvoiceLine[];

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}

/**
 * Optional itemized breakdown for an invoice. When absent, the invoice
 * renders its single `description` row as before — no flag, the data decides.
 */
@Entity('business_invoice_lines')
export class BusinessInvoiceLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'invoice_id' })
  @Index()
  invoiceId!: string;

  @ManyToOne(() => BusinessInvoice, (invoice) => invoice.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice?: BusinessInvoice;

  @Column({ type: 'varchar', length: 240 })
  description!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: moneyTransformer })
  quantity!: number;

  @Column({ type: 'bigint', name: 'unit_price_cdf', transformer: moneyTransformer })
  unitPriceCdf!: number;

  @Column({ type: 'bigint', name: 'total_cdf', transformer: moneyTransformer })
  totalCdf!: number;

  @Column({ type: 'integer', default: 0 })
  position!: number;
}
