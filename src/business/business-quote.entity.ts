import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { BusinessClient } from './business-client.entity';
import { moneyTransformer } from './business-money';
import { DEFAULT_BUSINESS_CURRENCY, type BusinessCurrency } from './business-currency';
import { BusinessOpportunity } from './business-opportunity.entity';

export const BUSINESS_QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'] as const;
export type BusinessQuoteStatus = (typeof BUSINESS_QUOTE_STATUSES)[number];

@Entity('business_quotes')
export class BusinessQuote {
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

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'varchar', length: 24, default: 'draft' })
  @Index()
  status!: BusinessQuoteStatus;

  @Column({ type: 'date', name: 'issued_on' })
  issuedOn!: string;

  @Column({ type: 'date', name: 'valid_until' })
  validUntil!: string;

  @Column({ type: 'integer', name: 'tax_rate', default: 0 })
  taxRate!: number;

  @Column({ type: 'bigint', name: 'subtotal_cdf', default: 0, transformer: moneyTransformer })
  subtotalCdf!: number;

  @Column({ type: 'bigint', name: 'tax_cdf', default: 0, transformer: moneyTransformer })
  taxCdf!: number;

  @Column({ type: 'bigint', name: 'total_cdf', default: 0, transformer: moneyTransformer })
  totalCdf!: number;

  /** One currency for the whole quote — its lines inherit it, no column of their own. */
  @Column({ type: 'varchar', length: 3, default: DEFAULT_BUSINESS_CURRENCY })
  currency!: BusinessCurrency;

  @Column({ type: 'text', name: 'payment_terms', nullable: true })
  paymentTerms!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @OneToMany(() => BusinessQuoteLine, (line) => line.quote)
  lines?: BusinessQuoteLine[];

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}

@Entity('business_quote_lines')
export class BusinessQuoteLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'quote_id' })
  @Index()
  quoteId!: string;

  @ManyToOne(() => BusinessQuote, (quote) => quote.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quote_id' })
  quote?: BusinessQuote;

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
