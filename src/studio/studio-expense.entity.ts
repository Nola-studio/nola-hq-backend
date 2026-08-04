import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type StudioExpenseCurrency = 'CAD' | 'USD' | 'CDF' | 'XAF';
export type StudioExpenseCategory =
  | 'infra_hosting'
  | 'domains_saas'
  | 'legal_admin'
  | 'marketing'
  | 'travel'
  | 'other';
export type StudioExpenseFrequency = 'monthly' | 'yearly' | 'one_time';

/**
 * An internal team expense. Amounts are stored as integer cents; totals are
 * always kept per-currency (never converted) — see `studio.expenses.ts`.
 */
@Entity('studio_expenses')
export class StudioExpense {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 500 })
  description!: string;

  @Column({ type: 'integer', name: 'amount_cents' })
  amountCents!: number;

  @Column({ type: 'varchar' })
  currency!: StudioExpenseCurrency;

  @Column({ type: 'varchar' })
  @Index()
  category!: StudioExpenseCategory;

  /** Team member's email (soft reference — `team_members.email`). */
  @Column({ type: 'varchar', length: 120, name: 'paid_by_email' })
  paidByEmail!: string;

  /** `YYYY-MM-DD`. */
  @Column({ type: 'date' })
  @Index()
  date!: string;

  @Column({ type: 'boolean', default: false })
  recurring!: boolean;

  @Column({ type: 'varchar', nullable: true })
  frequency!: StudioExpenseFrequency | null;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
