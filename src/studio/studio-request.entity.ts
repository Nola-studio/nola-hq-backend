import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';

export const STUDIO_REQUEST_TYPES = ['bug', 'suggestion', 'demande'] as const;
export type StudioRequestType = (typeof STUDIO_REQUEST_TYPES)[number];

export const STUDIO_REQUEST_STATUSES = [
  'nouvelle',
  'en_revue',
  'acceptee',
  'rejetee',
  'fermee',
] as const;
export type StudioRequestStatus = (typeof STUDIO_REQUEST_STATUSES)[number];

export const STUDIO_REQUEST_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;
export type StudioRequestPriority = (typeof STUDIO_REQUEST_PRIORITIES)[number];

/**
 * A bug report, suggestion, or standalone request filed against the
 * platform — deliberately kept separate from `WorkItem`. Nothing here ever
 * converts into a task: a request that's accepted still needs someone to
 * manually file the resulting work, so `projectId` is just an optional
 * pointer to give it context, never a scheduling link.
 */
@Entity('studio_requests')
export class StudioRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', default: 'demande' })
  type!: StudioRequestType;

  /** Optional context — a request may relate to no project. */
  @Column({ type: 'uuid', name: 'project_id', nullable: true })
  @Index()
  projectId!: string | null;

  @ManyToOne(() => RoadmapInitiative, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'project_id' })
  project?: RoadmapInitiative | null;

  /** Keycloak email of whoever filed the request. */
  @Column({ type: 'varchar', length: 160 })
  author!: string;

  /** Team member email — soft reference, nullable until triaged. */
  @Column({ type: 'varchar', length: 160, nullable: true })
  assignee!: string | null;

  @Column({ type: 'varchar', default: 'nouvelle' })
  @Index()
  status!: StudioRequestStatus;

  @Column({ type: 'varchar', default: 'P2' })
  priority!: StudioRequestPriority;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;

  /** Set when `status` reaches a terminal state (`rejetee` or `fermee`). */
  @Column({ name: 'closed_at', type: 'timestamp', nullable: true })
  closedAt!: Date | null;
}
