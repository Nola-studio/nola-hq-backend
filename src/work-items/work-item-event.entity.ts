import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { WorkItem } from './work-item.entity';

export type WorkItemEventAction =
  | 'created'
  | 'updated'
  | 'moved'
  | 'commented'
  | 'subtask_added'
  | 'subtask_updated'
  | 'closed'
  | 'attachment_added'
  | 'attachment_removed'
  | 'accepted'
  | 'dismissed'
  | 'branch_created'
  /** Ouverte depuis HQ ou reconnue depuis GitHub — le journal ne distingue
   *  pas la provenance ici, `meta.createdByHq` s'en charge. */
  | 'pull_request_opened';

@Entity('work_item_events')
export class WorkItemEvent {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'integer', name: 'work_item_id' })
  @Index()
  workItemId!: number;

  @ManyToOne(() => WorkItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_item_id' })
  workItem?: WorkItem;

  @Column({ type: 'varchar', length: 160 }) actor!: string;
  @Column({ type: 'varchar', length: 40 }) action!: WorkItemEventAction;
  @Column({ type: 'simple-json', default: '{}' }) meta!: Record<string, unknown>;
  @Column({ name: 'created_at' }) createdAt!: Date;
}
