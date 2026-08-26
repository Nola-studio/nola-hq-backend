import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { LegalEntity } from './legal-entity.entity';

/** Keys into `PDF_THEMES` (`business-pdf.service.ts`). `emerald` is Yekoli's own tenant-receipt palette — no HQ business unit is expected to use it, but it's a valid value. */
export const BUSINESS_UNIT_THEMES = ['emerald', 'navy', 'indigo', 'slate'] as const;
export type BusinessUnitThemeKey = (typeof BUSINESS_UNIT_THEMES)[number];

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

  /** PDF display override — falls back to `LEGAL_ENTITY.tagline` when null. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  tagline!: string | null;

  /** PDF footer override — falls back to `LEGAL_ENTITY.footerLine` when null. */
  @Column({ type: 'varchar', length: 200, name: 'footer_line', nullable: true })
  footerLine!: string | null;

  /** PDF color palette key — falls back to `'indigo'` (khi-lab's own palette) when null. See `resolvePdfTheme()`. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  theme!: BusinessUnitThemeKey | null;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
