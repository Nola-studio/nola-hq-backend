import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Ticket } from '../tickets/ticket.entity';

export type DeployStatus = 'success' | 'rolled-back';

@Entity('deploys')
export class Deploy {
  @PrimaryColumn()
  id!: string;

  @Column()
  @Index()
  app!: string;

  @Column()
  version!: string;

  @Column()
  env!: string;

  @Column()
  author!: string;

  @Column()
  t!: string;

  @Column({ type: 'varchar' })
  status!: DeployStatus;

  @Column()
  sha!: string;

  @Column({ type: 'text' })
  changelog!: string;

  /**
   * The `deployment`-category ticket that approved this promotion. Nullable:
   * dev deploys and anything logged before this process existed have none.
   * `SET NULL` rather than `RESTRICT` — Deploy is a log, it must never block
   * or be blocked by whatever happens to the ticket later.
   */
  @Column({ type: 'integer', name: 'ticket_id', nullable: true })
  @Index()
  ticketId!: number | null;

  @ManyToOne(() => Ticket, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ticket_id' })
  ticket?: Ticket;
}
