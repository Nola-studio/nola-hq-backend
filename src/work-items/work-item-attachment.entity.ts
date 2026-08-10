import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { WorkItem } from './work-item.entity';

/**
 * Metadata row for one uploaded file. The file itself lives on disk under
 * `ATTACHMENTS_DIR` (a Railway volume in prod), named `<id>` with no
 * extension — nothing about the on-disk name is ever derived from
 * user input, so there's no path-traversal surface. `originalName` is
 * display-only, used for the `Content-Disposition` filename on download.
 */
@Entity('work_item_attachments')
export class WorkItemAttachment {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ type: 'integer', name: 'work_item_id' })
  @Index()
  workItemId!: number;

  @ManyToOne(() => WorkItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_item_id' })
  workItem?: WorkItem;

  @Column({ type: 'varchar', length: 255, name: 'original_name' })
  originalName!: string;

  @Column({ type: 'varchar', length: 120, name: 'mime_type' })
  mimeType!: string;

  @Column({ type: 'integer', name: 'size_bytes' })
  sizeBytes!: number;

  @Column({ type: 'varchar', length: 160, name: 'uploaded_by' })
  uploadedBy!: string;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
