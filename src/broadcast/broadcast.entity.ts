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

  @Column({ name: 'scheduled_at', nullable: true, type: 'datetime' })
  scheduledAt!: Date | null;

  @Column({ name: 'sent_at', nullable: true, type: 'datetime' })
  sentAt!: Date | null;
}
