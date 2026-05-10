import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type TicketPriority = 'P1' | 'P2' | 'P3';
export type TicketStatus = 'open' | 'pending' | 'closed' | 'resolved';

export interface TicketReply {
  from: string;
  t: string;
  text: string;
}

@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  @Index()
  tenant!: string;

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

  @Column()
  age!: string;

  @Column()
  ago!: string;

  @Column({ type: 'simple-json', default: '[]' })
  replies!: TicketReply[];

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
