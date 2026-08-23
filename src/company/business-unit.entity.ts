import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { LegalEntity } from './legal-entity.entity';

/** Operating unit within a `LegalEntity`, e.g. Khi-Lab, Vantelis IT. */
@Entity('business_units')
export class BusinessUnit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Natural key for seeds/backfill, e.g. `khi-lab`. */
  @Column({ type: 'varchar', length: 40, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'uuid', name: 'legal_entity_id' })
  @Index()
  legalEntityId!: string;

  @ManyToOne(() => LegalEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'legal_entity_id' })
  legalEntity?: LegalEntity;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
