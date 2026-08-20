import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * One atomic, year-scoped counter per document prefix (`DEV`, `FAC`, `REC`,
 * `CTR`, …), shared by quotes/invoices/receipts/contracts. Replaces the old
 * `${prefix}-${YYYYMMDD}-${random6}` generator, whose uniqueness was only
 * enforced by a `findOne` check-then-insert — a real race under concurrent
 * creates. Existing rows keep their old-format numbers; only numbers minted
 * after this table exists use `${prefix}-${year}-${00001}`.
 */
@Entity('business_number_sequences')
export class BusinessNumberSequence {
  @PrimaryColumn({ type: 'varchar', length: 8 })
  prefix!: string;

  @PrimaryColumn({ type: 'integer' })
  year!: number;

  @Column({ type: 'integer', name: 'last_value', default: 0 })
  lastValue!: number;
}
