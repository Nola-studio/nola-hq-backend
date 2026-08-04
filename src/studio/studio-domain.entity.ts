import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A domain the team owns or manages — mirrors the workbook's Domains sheet.
 * `linkedProjectId` is a soft reference (`studio_projects.id`, no FK): most
 * domains aren't tied to a project at all (e.g. shared infra), so this is
 * optional by design, not an oversight.
 */
@Entity('studio_domains')
export class StudioDomain {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  domain!: string;

  /** `YYYY-MM-DD`. */
  @Column({ type: 'date', name: 'purchase_date', nullable: true })
  purchaseDate!: string | null;

  /** `YYYY-MM-DD`. */
  @Column({ type: 'date', name: 'renewal_date', nullable: true })
  @Index()
  renewalDate!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  registrar!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  platform!: string | null;

  @Column({ type: 'text', nullable: true })
  purpose!: string | null;

  /** USD. */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  price!: string | null;

  @Column({ type: 'boolean', name: 'auto_renew', default: true })
  autoRenew!: boolean;

  @Column({ type: 'varchar', length: 120, nullable: true })
  status!: string | null;

  /** Soft reference — `studio_projects.id`. */
  @Column({ type: 'uuid', name: 'linked_project_id', nullable: true })
  linkedProjectId!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  /** e.g. `NolaaStudio-prod (Railway)`, `Namecheap (Greg)`. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  workspace!: string | null;

  @Column({ type: 'varchar', length: 160, name: 'billing_email', nullable: true })
  billingEmail!: string | null;

  /** Team member's email (soft reference — `team_members.email`). */
  @Column({ type: 'varchar', length: 120, name: 'paid_by_email', nullable: true })
  paidByEmail!: string | null;

  /** e.g. `Card ending 1090` — free text, never a raw card number. */
  @Column({ type: 'varchar', length: 120, name: 'payment_method', nullable: true })
  paymentMethod!: string | null;

  /** e.g. `Annual`, `Monthly`. */
  @Column({ type: 'varchar', length: 40, name: 'billing_cycle', nullable: true })
  billingCycle!: string | null;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
