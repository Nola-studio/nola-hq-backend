import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Incorporated legal entity a `BusinessUnit` operates under. */
@Entity('legal_entities')
export class LegalEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Natural key for seeds/backfill, e.g. `nolaa-studio`. */
  @Column({ type: 'varchar', length: 40, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  /** e.g. `QC-CA`. */
  @Column({ type: 'varchar', length: 40 })
  jurisdiction!: string;

  /** Null until incorporation. */
  @Column({ type: 'varchar', length: 40, name: 'tax_regime', nullable: true })
  taxRegime!: string | null;

  /** NEQ. Null until incorporation. */
  @Column({ type: 'varchar', length: 64, name: 'registration_number', nullable: true })
  registrationNumber!: string | null;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
