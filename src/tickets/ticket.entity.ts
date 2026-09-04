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

/**
 * What a `pending` ticket is actually waiting on. Only 'client' pauses the
 * SLA clock — 'vendor'/'internal' mean the wait is on Nola's side, not the
 * client's, and shouldn't be credited as SLA-paused time. Null (every
 * ticket predating this column, and any pending transition that doesn't
 * specify) is treated as 'client' — see TicketsService.
 */
export type TicketPendingReason = 'client' | 'vendor' | 'internal';

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

  /** Only meaningful while `status === 'pending'`; cleared on any other transition. */
  @Column({ type: 'varchar', length: 16, name: 'pending_reason', nullable: true })
  pendingReason!: TicketPendingReason | null;

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

  /**
   * The producing app's own upstream due date (e.g. Vantelis IT's
   * `meta.dueAt`), when it sends one — display/context only, never HQ's
   * SLA source of truth. Null for kelasi/yekoli (no upstream commitment)
   * and any manually-created ticket.
   */
  @Column({ type: 'timestamp', name: 'due_at', nullable: true })
  dueAt!: Date | null;

  @Column({ type: 'simple-json', default: '[]' })
  replies!: TicketReply[];

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;

  /**
   * Functional domain and capability (§4A). Nullable: the referential's
   * twelve domains were seeded before anything was classified, and
   * classification happens domain by domain.
   */
  @Column({ type: 'uuid', name: 'domain_id', nullable: true })
  @Index()
  domainId!: string | null;

  @Column({ type: 'uuid', name: 'capability_id', nullable: true })
  capabilityId!: string | null;
}
