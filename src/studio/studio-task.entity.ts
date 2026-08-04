import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { StudioProject } from './studio-project.entity';
import { StudioMeeting } from './studio-meeting.entity';

export type StudioTaskStatus =
  | 'backlog'
  | 'this_quarter'
  | 'in_progress'
  | 'blocked'
  | 'in_review'
  | 'done';
export type StudioTaskCategory =
  | 'product'
  | 'sales'
  | 'brand'
  | 'admin_legal'
  | 'infra';
export type StudioTaskPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent';

/**
 * A team task on the Studio kanban board. `position` orders it inside its
 * own `status` column — re-densified on every `POST /studio/tasks/:id/move`,
 * same algorithm as `roadmap.board.ts`'s `planMove`.
 */
@Entity('studio_tasks')
export class StudioTask {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'project_id' })
  @Index()
  projectId!: string;

  /** No project ever gets deleted (fixed, tiny reference set) — default FK action. */
  @ManyToOne(() => StudioProject)
  @JoinColumn({ name: 'project_id' })
  project?: StudioProject;

  /** `YEK-1`, `YEK-2`, … — sequential per project, assigned at create time. */
  @Column({ type: 'varchar', length: 32, unique: true })
  identifier!: string;

  @Column({ type: 'varchar', length: 500 })
  title!: string;

  /** Markdown. */
  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', default: 'backlog' })
  @Index()
  status!: StudioTaskStatus;

  @Column({ type: 'varchar' })
  category!: StudioTaskCategory;

  /** Team member's email (soft reference — `team_members.email`). */
  @Column({ type: 'varchar', length: 120, name: 'assignee_email', nullable: true })
  @Index()
  assigneeEmail!: string | null;

  /** `YYYY-MM-DD` — TypeORM hands `date` columns back as strings. */
  @Column({ type: 'date', name: 'due_date', nullable: true })
  @Index()
  dueDate!: string | null;

  @Column({ type: 'varchar', default: 'none' })
  priority!: StudioTaskPriority;

  /** The meeting whose decision created this task, if any. */
  @Column({ type: 'uuid', name: 'meeting_id', nullable: true })
  meetingId!: string | null;

  @ManyToOne(() => StudioMeeting, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'meeting_id' })
  meeting?: StudioMeeting | null;

  @Column({ type: 'varchar', length: 120, name: 'created_by_email' })
  createdByEmail!: string;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;

  /** Set when `status` becomes `done`, cleared otherwise. Drives the activity heatmap. */
  @Column({ name: 'completed_at', nullable: true, type: 'timestamp' })
  completedAt!: Date | null;

  /** Rank inside the `status` kanban column (0-based, dense). */
  @Column({ type: 'integer', default: 0 })
  position!: number;
}
