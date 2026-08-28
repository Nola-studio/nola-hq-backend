import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BusinessUnit } from '../company/business-unit.entity';

export type TicketPriority = 'P1' | 'P2' | 'P3';
export type TicketStatus = 'open' | 'pending' | 'closed' | 'resolved';
export type TicketCategory =
  | 'technical'
  | 'billing'
  | 'account'
  | 'feature'
  | 'deployment'
  | 'other';

export type TicketReplyVisibility = 'internal' | 'client';

export interface TicketReply {
  from: string;
  t: string;
  text: string;
  /** Whether the eventual portal read path may show this to the client. Never inferred — an operator opts in. */
  visibility: TicketReplyVisibility;
}

@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  @Index()
  tenant!: string;

  @Column({ type: 'uuid', name: 'business_unit_id' })
  @Index()
  businessUnitId!: string;

  @ManyToOne(() => BusinessUnit, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'business_unit_id' })
  businessUnit?: BusinessUnit;

  @Column()
  subject!: string;

  @Column()
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column()
  contact!: string;

  @Column({ type: 'varchar' })
  @Index()
  priority!: TicketPriority;

  @Column({ type: 'varchar' })
  @Index()
  status!: TicketStatus;

  @Column()
  assignee!: string;

  @Column()
  assigned!: string;

  @Column()
  sla!: string;

  /** What the request is about — drives HQ triage. Nullable: legacy + manually
   * created tickets have no category. */
  @Column({ type: 'varchar', nullable: true })
  @Index()
  category!: TicketCategory | null;

  /** Origin of the ticket, e.g. 'kelasi-owner-app'. Nullable for legacy rows. */
  @Column({ type: 'varchar', nullable: true })
  source!: string | null;

  @Column({ type: 'simple-json', default: '[]' })
  replies!: TicketReply[];

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
