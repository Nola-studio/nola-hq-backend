import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Ticket } from '../tickets/ticket.entity';

/**
 * Open string, same convention as `TicketEventAction` — new kinds don't
 * need a migration, just a new literal and a new trigger call site.
 */
export type NotificationKind =
  | 'ticket_created'
  | 'ticket_assigned'
  | 'ticket_status_changed'
  | 'sla_response_approaching'
  | 'sla_resolution_approaching';

/**
 * Per-recipient, materialized at the trigger — deliberately not derived
 * from `TicketEvent` (per-ticket, no recipient concept, one row per
 * action regardless of how many people should know about it). Written at
 * the same call sites that already fire push, sharing recipient
 * resolution with it (see `TicketsService`/`TicketsSlaBreachScheduler`),
 * but persisted and delivered independently — push is best-effort and
 * silently no-ops without a subscription; a `Notification` row always
 * succeeds and is the durable record that something was actually
 * surfaced to someone.
 *
 * `readAt` and `clearedAt` are separate nullable timestamps, not one
 * status field: reversible like every other "make this go away" action
 * in this schema (`BusinessUnit.isActive`, `Product.archived`,
 * `RoadmapInitiative.archived`) — clearing removes a notification from
 * the default view, it never deletes the row.
 */
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** `TeamMember.id` — plain string, no FK, same convention as
   * `Ticket.assignee`/`TicketEvent.actor` (never a Keycloak `sub`: this
   * schema's only existing per-person identity for ticket-adjacent
   * things is the local team_members row). */
  @Column({ type: 'varchar', name: 'recipient_id' })
  @Index()
  recipientId!: string;

  @Column({ type: 'varchar' })
  kind!: NotificationKind;

  /** Nullable — future kinds may not be ticket-scoped. CASCADE matches
   * TicketEvent's own FK to Ticket; tickets are never deleted today, so
   * this only matters if that ever changes. */
  @Column({ type: 'integer', name: 'ticket_id', nullable: true })
  @Index()
  ticketId!: number | null;

  @ManyToOne(() => Ticket, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket?: Ticket;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  body!: string | null;

  /** Console route to open on click, e.g. '/tickets' — matches `PushPayload.url`. */
  @Column({ type: 'varchar', nullable: true })
  url!: string | null;

  @Column({ type: 'timestamp', name: 'read_at', nullable: true })
  readAt!: Date | null;

  @Column({ type: 'timestamp', name: 'cleared_at', nullable: true })
  clearedAt!: Date | null;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
