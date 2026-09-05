import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { BusinessUnit } from '../company/business-unit.entity';
import type { TicketPriority } from '../tickets/ticket.entity';

/**
 * Per-brand, per-priority SLA target. A row existing with a null target
 * means "tracked, not yet configured" — the row being absent means
 * "not tracked at all". Never conflate the two: `SlaPolicyService` never
 * synthesizes a missing row, and never treats null as "no SLA" the same
 * way it treats an absent row.
 */
@Entity('sla_policies')
@Unique(['businessUnitId', 'priority'])
export class SlaPolicy {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'business_unit_id' })
  @Index()
  businessUnitId!: string;

  @ManyToOne(() => BusinessUnit, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'business_unit_id' })
  businessUnit?: BusinessUnit;

  @Column({ type: 'varchar' })
  priority!: TicketPriority;

  /** Minutes to first client-visible reply. Null = not yet configured. */
  @Column({ type: 'integer', name: 'response_target_minutes', nullable: true })
  responseTargetMinutes!: number | null;

  /** Minutes to resolved/closed. Null = not yet configured. */
  @Column({ type: 'integer', name: 'resolution_target_minutes', nullable: true })
  resolutionTargetMinutes!: number | null;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
