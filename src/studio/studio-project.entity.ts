import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type StudioProjectType =
  | 'infrastructure_cloud'
  | 'web_app_development'
  | 'mobile_app_development'
  | 'website'
  | 'administrative'
  | 'maintenance_support'
  | 'other';
export type StudioProjectPriority = 'high' | 'medium' | 'low';
/** Project *health*, distinct from the `active`/`archived` lifecycle `status`. */
export type StudioProjectHealthStatus = 'on_track' | 'on_hold' | 'behind' | 'completed';

/**
 * A workstream tasks are filed under (e.g. `YEK`). Fully user-managed —
 * `POST /studio/projects` creates, `PATCH /studio/projects/:id` edits
 * everything but `key`, and `POST /studio/projects/:id/archive` /
 * `.../unarchive` toggle `status`. There is no seed and no delete: `key`
 * is referenced by `StudioTask.identifier` (`YEK-1`, `YEK-2`, …) for the
 * life of every task filed under it, so a project is retired by archiving,
 * never removed.
 */
@Entity('studio_projects')
export class StudioProject {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  /** Immutable after creation — prefixes every task identifier filed here. */
  @Column({ type: 'varchar', length: 12, unique: true })
  key!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', default: 'active' })
  status!: 'active' | 'archived';

  /** Hex, e.g. `#4F46E5` — used to colour this project across the dashboard. */
  @Column({ type: 'varchar', length: 7, default: '#94A3B8' })
  color!: string;

  /** Team member's email (soft reference — `team_members.email`). */
  @Column({ type: 'varchar', length: 120, name: 'owner_email', nullable: true })
  ownerEmail!: string | null;

  @Column({ type: 'varchar', nullable: true })
  type!: StudioProjectType | null;

  @Column({ type: 'varchar', nullable: true })
  priority!: StudioProjectPriority | null;

  /** Project health (On Track / On Hold / Behind / Completed) — not the archive lifecycle. */
  @Column({ type: 'varchar', name: 'health_status', nullable: true })
  healthStatus!: StudioProjectHealthStatus | null;

  /** USD. */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  budget!: string | null;

  /** USD. */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  cost!: string | null;

  /** `YYYY-MM-DD`. */
  @Column({ type: 'date', name: 'start_date', nullable: true })
  startDate!: string | null;

  /** `YYYY-MM-DD`. */
  @Column({ type: 'date', name: 'due_date', nullable: true })
  dueDate!: string | null;

  /** Team member's email (soft reference — `team_members.email`). */
  @Column({ type: 'varchar', length: 120, name: 'lead_assignee_email', nullable: true })
  leadAssigneeEmail!: string | null;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
