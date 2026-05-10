import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type ActivityCategory =
  | 'finance'
  | 'tech'
  | 'incident'
  | 'support'
  | 'commercial';

@Entity('activity_events')
export class ActivityEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  t!: string;

  @Column({ name: 'created_at' })
  @Index()
  createdAt!: Date;

  @Column()
  actor!: string;

  @Column({ type: 'varchar' })
  @Index()
  cat!: ActivityCategory;

  @Column({ type: 'text' })
  text!: string;

  @Column({ type: 'varchar', nullable: true })
  ref!: string | null;
}
