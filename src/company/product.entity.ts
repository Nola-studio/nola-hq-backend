import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BusinessUnit } from './business-unit.entity';

/** A product/app shipped by a `BusinessUnit`, e.g. Yekoli, K-River. */
@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Natural key for seeds/backfill, e.g. `yekoli`. */
  @Column({ type: 'varchar', length: 40, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'uuid', name: 'business_unit_id' })
  @Index()
  businessUnitId!: string;

  @ManyToOne(() => BusinessUnit, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'business_unit_id' })
  businessUnit?: BusinessUnit;

  @Column({ type: 'boolean', name: 'is_internal', default: false })
  isInternal!: boolean;

  /** Legacy source strings emitted by client apps that map to this product. */
  @Column({ type: 'simple-json', name: 'source_aliases', default: '[]' })
  sourceAliases!: string[];

  @Column({ type: 'boolean', default: false })
  archived!: boolean;

  /** Whether HQ-driven tenant provisioning (`POST /tenants`) is implemented
   *  for this product. Editable from Entreprises — replaces the old
   *  hardcoded `PROVISIONABLE_PRODUCT_CODES` set. */
  @Column({ type: 'boolean', name: 'is_provisionable', default: false })
  isProvisionable!: boolean;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
