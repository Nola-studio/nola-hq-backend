import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A recurring subscription — mirrors the workbook's Recurring sheet.
 * `annualized` is computed from `amount`/`cycle` at read time (see
 * `studio.recurring.ts`), never stored — same reasoning as every other
 * derived total in Studio (dashboard KPIs, expense monthly-equivalents).
 */
@Entity('studio_recurring')
export class StudioRecurring {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  service!: string;

  @Column({ type: 'text', nullable: true })
  purpose!: string | null;

  /** USD. */
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount!: string;

  /** e.g. `Monthly`, `Monthly (usage-based)`. */
  @Column({ type: 'varchar', length: 60 })
  cycle!: string;

  /** e.g. `1st of month`, `~28th` — free text, not a strict day-of-month int. */
  @Column({ type: 'varchar', length: 60, name: 'charge_day', nullable: true })
  chargeDay!: string | null;

  /** Team member's email (soft reference — `team_members.email`). */
  @Column({ type: 'varchar', length: 120, name: 'paid_by_email', nullable: true })
  paidByEmail!: string | null;

  @Column({ type: 'varchar', length: 200, name: 'billing_account', nullable: true })
  billingAccount!: string | null;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
