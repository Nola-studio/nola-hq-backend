import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type BroadcastChannel = 'whatsapp' | 'email' | 'in-app';
export type BroadcastStatus = 'draft' | 'scheduled' | 'sent' | 'failed';

@Entity('broadcasts')
export class Broadcast {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  @Index()
  channel!: BroadcastChannel;

  @Column()
  subject!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'simple-json', default: '[]' })
  recipients!: string[];

  @Column({ type: 'varchar' })
  @Index()
  status!: BroadcastStatus;

  @Column()
  author!: string;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'scheduled_at', nullable: true, type: 'timestamp' })
  scheduledAt!: Date | null;

  @Column({ name: 'sent_at', nullable: true, type: 'timestamp' })
  sentAt!: Date | null;

  /**
   * Number of recipients the dispatch successfully published to
   * nola-notify for (email/whatsapp), or the recipient count delivered to
   * the in-app feed. `0` until the broadcast is sent. Proves the send did
   * real work and lets the UI show "delivered to N".
   */
  @Column({ name: 'sent_count', type: 'integer', default: 0 })
  sentCount!: number;

  /**
   * Last dispatch error (truncated). Set when a send partially or fully
   * failed so the operator can retry/escalate; cleared on a clean send.
   */
  @Column({ name: 'send_error', type: 'varchar', length: 500, nullable: true })
  sendError!: string | null;
}
