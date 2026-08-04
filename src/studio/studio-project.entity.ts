import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Small set of internal workstreams tasks are filed under (e.g. `YEK`,
 * `NOLA`, `STU`). Three defaults are seeded on boot (`StudioService.
 * onModuleInit`); `POST /studio/projects` lets an operator add more. Only
 * creation is exposed — `key` is referenced by `StudioTask.projectId` for
 * its `identifier` sequence (`YEK-1`, `YEK-2`, …) and isn't meant to change.
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
