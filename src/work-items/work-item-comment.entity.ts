import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { WorkItem } from './work-item.entity';

@Entity('work_item_comments')
export class WorkItemComment {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'integer', name: 'work_item_id' })
  @Index()
  workItemId!: number;

  @ManyToOne(() => WorkItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_item_id' })
  workItem?: WorkItem;

  @Column({ type: 'varchar', length: 160 }) author!: string;
  @Column({ type: 'text' }) body!: string;
  @Column({ name: 'created_at' }) createdAt!: Date;
}
