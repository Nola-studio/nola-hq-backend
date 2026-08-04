import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export const BUSINESS_REMINDER_STATUSES = ['pending', 'done', 'dismissed'] as const;
export type BusinessReminderStatus = (typeof BUSINESS_REMINDER_STATUSES)[number];
export const BUSINESS_REMINDER_ENTITY_TYPES = ['opportunity', 'contract', 'quote', 'invoice', 'project'] as const;
export type BusinessReminderEntityType = (typeof BUSINESS_REMINDER_ENTITY_TYPES)[number];

@Entity('business_reminders')
export class BusinessReminder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 180, unique: true, nullable: true })
  fingerprint!: string | null;

  @Column({ type: 'varchar', length: 24, name: 'entity_type' })
  entityType!: BusinessReminderEntityType;

  @Column({ type: 'uuid', name: 'entity_id' })
  @Index()
  entityId!: string;

  @Column({ type: 'varchar', length: 220 })
  title!: string;

  @Column({ type: 'timestamp', name: 'due_at' })
  @Index()
  dueAt!: Date;

  @Column({ type: 'varchar', length: 160, nullable: true })
  assignee!: string | null;

  @Column({ type: 'varchar', length: 24, default: 'pending' })
  @Index()
  status!: BusinessReminderStatus;

  @Column({ type: 'boolean', default: false })
  automatic!: boolean;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
