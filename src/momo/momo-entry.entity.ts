import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type MomoProvider = 'M-Pesa' | 'Airtel' | 'Orange' | 'Wave' | 'MTN';
export type MomoKind = 'in' | 'payout';

@Entity('momo_entries')
export class MomoEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  ts!: string;

  @Column({ type: 'varchar' })
  @Index()
  provider!: MomoProvider;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  tenant!: string | null;

  @Column({ type: 'integer' })
  amt!: number;

  @Column({ type: 'varchar' })
  @Index()
  kind!: MomoKind;

  @Column({ unique: true })
  ref!: string;
}
