import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * One row per (task, notification kind, day) that has already fired — the
 * due-soon cron's guard against re-notifying the same task every day it
 * stays within the 48h window.
 */
@Entity('studio_notification_dedups')
@Unique('UQ_studio_dedup_task_kind_day', ['taskId', 'kind', 'sentOn'])
export class StudioNotificationDedup {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** `work_items.id` (integer, stringified) — was `studio_tasks.id` (uuid) pre-merge. */
  @Column({ type: 'varchar', name: 'task_id' })
  @Index()
  taskId!: string;

  /** `'due_soon'` today; open string so future kinds don't need a migration. */
  @Column({ type: 'varchar' })
  kind!: string;

  /** `YYYY-MM-DD` — the calendar day this notification was sent on. */
  @Column({ type: 'date', name: 'sent_on' })
  sentOn!: string;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
