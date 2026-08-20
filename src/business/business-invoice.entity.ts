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

export const BUSINESS_PAYMENT_METHODS = ['cash', 'bank_transfer', 'mobile_money', 'card', 'other'] as const;
export type BusinessPaymentMethod = (typeof BUSINESS_PAYMENT_METHODS)[number];

/** French display labels for the receipt PDF (Yekoli's reference shows "Espèces" for cash). */
export const BUSINESS_PAYMENT_METHOD_LABELS: Record<BusinessPaymentMethod, string> = {
  cash: 'Espèces',
  bank_transfer: 'Virement bancaire',
  mobile_money: 'Mobile Money',
  card: 'Carte',
  other: 'Autre',
};

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

  /** Percentage, entered manually by the operator — no jurisdiction-based lookup. */
  @Column({ type: 'numeric', precision: 5, scale: 2, name: 'tax_rate', default: 0, transformer: moneyTransformer })
  taxRate!: number;

  /** Always derived server-side from `taxRate` against the lines subtotal — never a raw client input. */
  @Column({ type: 'bigint', name: 'tax_cdf', default: 0, transformer: moneyTransformer })
  taxCdf!: number;

  /** e.g. "TPS/TVQ", "TVA" — falls back to a generic "Taxe" label on the PDF when unset. */
  @Column({ type: 'varchar', length: 40, name: 'tax_label', nullable: true })
  taxLabel!: string | null;

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

  /** Minted once, by `markPaid()`, at the same moment as `paymentMethod`/`verificationToken`. */
  @Column({ type: 'varchar', length: 64, name: 'receipt_number', unique: true, nullable: true })
  receiptNumber!: string | null;

  @Column({ type: 'varchar', length: 24, name: 'payment_method', nullable: true })
  paymentMethod!: BusinessPaymentMethod | null;

  @Column({ type: 'varchar', length: 120, name: 'payment_reference', nullable: true })
  paymentReference!: string | null;

  /** Random, stored value — not a content hash. Powers the public `/verify/receipt/:token` lookup. */
  @Column({ type: 'varchar', length: 64, name: 'verification_token', unique: true, nullable: true })
  verificationToken!: string | null;

  /** Set by `voidReceipt()`. The token/number stay resolvable — verification reports "voided", not 404. */
  @Column({ type: 'timestamp', name: 'receipt_voided_at', nullable: true })
  receiptVoidedAt!: Date | null;

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
