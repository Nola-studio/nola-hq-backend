import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { StudioMeeting } from '../studio/studio-meeting.entity';
import { WorkSprint } from './work-sprint.entity';

export const WORK_ITEM_TYPES = ['bug', 'feature', 'task', 'ops', 'debt'] as const;
export type WorkItemType = (typeof WORK_ITEM_TYPES)[number];

export const WORK_ITEM_STATUSES = [
  'todo',
  'in_progress',
  'blocked',
  'review',
  'resolved',
  'closed',
] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

/** `resolved` and `closed` both mean "work is done" — `closed` is just past its reopen window. */
export function isDoneStatus(status: WorkItemStatus | string): boolean {
  return status === 'resolved' || status === 'closed';
}

export const WORK_ITEM_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;
export type WorkItemPriority = (typeof WORK_ITEM_PRIORITIES)[number];

export const WORK_ITEM_CATEGORIES = ['product', 'sales', 'brand', 'admin_legal', 'infra'] as const;
export type WorkItemCategory = (typeof WORK_ITEM_CATEGORIES)[number];

/**
 * One piece of internal Nola Studio work. Support tickets deliberately live in
 * their own `tickets` table: a work item is authored and owned by the internal
 * team and always belongs to a roadmap initiative/project at creation time.
 */
@Entity('work_items')
export class WorkItem {
  @PrimaryGeneratedColumn()
  id!: number;

  /** Stable human reference, generated after the serial id (e.g. YEKOLI-42). */
  @Column({ type: 'varchar', length: 32, unique: true, nullable: true })
  reference!: string | null;

  @Column({ type: 'uuid', name: 'project_id', nullable: true })
  @Index()
  projectId!: string | null;

  @ManyToOne(() => RoadmapInitiative, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'project_id' })
  project?: RoadmapInitiative | null;

  @Column({ type: 'uuid', name: 'sprint_id', nullable: true })
  @Index()
  sprintId!: string | null;

  @ManyToOne(() => WorkSprint, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sprint_id' })
  sprint?: WorkSprint | null;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', default: 'task' })
  type!: WorkItemType;

  @Column({ type: 'varchar', default: 'todo' })
  @Index()
  status!: WorkItemStatus;

  @Column({ type: 'varchar', default: 'P2' })
  @Index()
  priority!: WorkItemPriority;

  /** Keycloak subject/email of the person who created the item. */
  @Column({ type: 'varchar', length: 160 })
  reporter!: string;

  /** Team member id. Soft reference so historical work survives departures. */
  @Column({ type: 'varchar', length: 160, nullable: true })
  @Index()
  assignee!: string | null;

  @Column({ type: 'date', name: 'due_date', nullable: true })
  dueDate!: string | null;

  @Column({ type: 'text', name: 'blocked_reason', nullable: true })
  blockedReason!: string | null;

  @Column({ type: 'integer', default: 0 })
  position!: number;

  @Column({ type: 'integer', name: 'estimate_points', default: 0 })
  estimatePoints!: number;

  /** Nola-internal work classification (absorbed from Studio's tasks). */
  @Column({ type: 'varchar', nullable: true })
  category!: WorkItemCategory | null;

  @Column({ type: 'numeric', precision: 8, scale: 2, name: 'hours_spent', nullable: true })
  hoursSpent!: string | null;

  /** 0-100. */
  @Column({ type: 'integer', name: 'progress_percent', nullable: true })
  progressPercent!: number | null;

  /** The meeting whose decision created this item, if any. */
  @Column({ type: 'uuid', name: 'meeting_id', nullable: true })
  meetingId!: string | null;

  @ManyToOne(() => StudioMeeting, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'meeting_id' })
  meeting?: StudioMeeting | null;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;

  /** Stamped when status enters `resolved`; cleared if reopened before closing. */
  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt!: Date | null;

  /** Stamped when status enters `closed` (auto, `REOPEN_WINDOW_MS` after `resolvedAt`, or a manual move). */
  @Column({ name: 'closed_at', type: 'timestamp', nullable: true })
  closedAt!: Date | null;
}
