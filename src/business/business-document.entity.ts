import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export const BUSINESS_DOCUMENT_ENTITY_TYPES = ['client', 'project', 'contract', 'quote', 'invoice'] as const;
export type BusinessDocumentEntityType = (typeof BUSINESS_DOCUMENT_ENTITY_TYPES)[number];

@Entity('business_documents')
@Index(['entityType', 'entityId'])
export class BusinessDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 24, name: 'entity_type' })
  entityType!: BusinessDocumentEntityType;

  @Column({ type: 'uuid', name: 'entity_id' })
  entityId!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 500 })
  url!: string;

  @Column({ type: 'varchar', length: 120, name: 'mime_type', nullable: true })
  mimeType!: string | null;

  @Column({ type: 'varchar', length: 80, default: 'other' })
  kind!: string;

  @Column({ type: 'varchar', length: 160, name: 'added_by', nullable: true })
  addedBy!: string | null;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
