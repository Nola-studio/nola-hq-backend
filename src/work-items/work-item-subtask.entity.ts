import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { WorkItem } from './work-item.entity';

@Entity('work_item_subtasks')
export class WorkItemSubtask {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'integer', name: 'work_item_id' })
  @Index()
  workItemId!: number;

  @ManyToOne(() => WorkItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_item_id' })
  workItem?: WorkItem;

  @Column({ type: 'varchar', length: 240 }) title!: string;
  @Column({ type: 'boolean', default: false }) done!: boolean;
  @Column({ type: 'integer', default: 0 }) position!: number;
  @Column({ type: 'varchar', length: 160, nullable: true }) assignee!: string | null;
  @Column({ name: 'created_at' }) createdAt!: Date;
  @Column({ name: 'updated_at' }) updatedAt!: Date;
}
