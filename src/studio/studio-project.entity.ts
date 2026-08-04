import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Fixed, small set of internal workstreams tasks are filed under (e.g.
 * `YEK`, `NOLA`, `STU`). No CRUD is exposed for this — the set is seeded
 * once and referenced by `StudioTask.projectId` for its `identifier`
 * sequence (`YEK-1`, `YEK-2`, …).
 */
@Entity('studio_projects')
export class StudioProject {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 12, unique: true })
  key!: string;

  @Column({ type: 'varchar', default: 'active' })
  status!: 'active' | 'paused' | 'done';

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
