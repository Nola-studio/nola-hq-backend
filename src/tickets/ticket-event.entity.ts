import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Ticket, type TicketStatus } from './ticket.entity';

export type TicketEventAction =
  | 'created'
  | 'status_changed'
  | 'assigned'
  | 'replied'
  | 'updated'
  /**
   * Written once per ticket, ever — never re-fires even across a
   * pause/resume cycle. A partial unique index on (ticket_id, action)
   * enforces that at the DB level (see TicketEventSlaAlertIndex
   * migration); a scheduler sweep inserts first and catches the
   * violation as "already alerted", not an in-memory check, so it stays
   * correct even if two sweeps overlap.
   */
  | 'sla_response_approaching'
  | 'sla_response_breached'
  | 'sla_resolution_approaching'
  | 'sla_resolution_breached';

/**
 * First-class fromStatus/toStatus/reason columns, deliberately unlike
 * WorkItemEvent — there, from/to live inside `meta` (e.g. `moved`'s
 * `{ from, to }`), which can't be filtered or indexed on. `meta` still
 * exists here for whatever doesn't warrant its own column (e.g.
 * `replied`'s visibility).
 */
@Entity('ticket_events')
export class TicketEvent {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'integer', name: 'ticket_id' })
  @Index()
  ticketId!: number;

  @ManyToOne(() => Ticket, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket?: Ticket;

  @Column({ type: 'varchar', length: 160 }) actor!: string;
  @Column({ type: 'varchar', length: 40 }) action!: TicketEventAction;

  @Column({ type: 'varchar', length: 24, name: 'from_status', nullable: true })
  fromStatus!: TicketStatus | null;

  @Column({ type: 'varchar', length: 24, name: 'to_status', nullable: true })
  toStatus!: TicketStatus | null;

  @Column({ type: 'varchar', length: 240, nullable: true })
  reason!: string | null;

  @Column({ type: 'simple-json', default: '{}' })
  meta!: Record<string, unknown>;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
