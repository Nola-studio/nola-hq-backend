import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

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

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
