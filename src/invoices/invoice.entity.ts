import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type InvoiceStatus = 'paid' | 'pending' | 'late' | 'overdue';

@Entity('invoices')
export class Invoice {
  @PrimaryColumn()
  id!: string;

  @Column()
  @Index()
  tenant!: string;

  @Column({ type: 'integer' })
  amt!: number;

  @Column()
  due!: string;

  @Column({ type: 'varchar' })
  @Index()
  status!: InvoiceStatus;

  @Column()
  method!: string;

  @Column()
  issued!: string;
}
