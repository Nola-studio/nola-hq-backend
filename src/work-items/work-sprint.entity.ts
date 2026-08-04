import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';

export const WORK_SPRINT_STATUSES = ['planned', 'active', 'completed'] as const;
export type WorkSprintStatus = (typeof WORK_SPRINT_STATUSES)[number];

@Entity('work_sprints')
export class WorkSprint {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'uuid', name: 'project_id', nullable: true })
  @Index()
  projectId!: string | null;

  @ManyToOne(() => RoadmapInitiative, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'project_id' })
  project?: RoadmapInitiative | null;

  @Column({ type: 'varchar', length: 120 }) name!: string;
  @Column({ type: 'text', nullable: true }) goal!: string | null;
  @Column({ type: 'varchar', default: 'planned' }) @Index() status!: WorkSprintStatus;
  @Column({ type: 'date', name: 'start_date', nullable: true }) startDate!: string | null;
  @Column({ type: 'date', name: 'end_date', nullable: true }) endDate!: string | null;
  @Column({ name: 'created_at' }) createdAt!: Date;
  @Column({ name: 'updated_at' }) updatedAt!: Date;
}
