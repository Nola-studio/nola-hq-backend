import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { WorkItem } from './work-item.entity';

/** `workItem` cannot start/finish until `dependsOn` is done. */
@Entity('work_item_dependencies')
@Index(['workItemId', 'dependsOnId'], { unique: true })
export class WorkItemDependency {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'integer', name: 'work_item_id' })
  @Index()
  workItemId!: number;

  @ManyToOne(() => WorkItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_item_id' })
  workItem?: WorkItem;

  @Column({ type: 'integer', name: 'depends_on_id' })
  @Index()
  dependsOnId!: number;

  @ManyToOne(() => WorkItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'depends_on_id' })
  dependsOn?: WorkItem;

  @Column({ name: 'created_at' }) createdAt!: Date;
}
