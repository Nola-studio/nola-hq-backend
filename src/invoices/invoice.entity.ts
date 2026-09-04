import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type InvoiceStatus = 'paid' | 'pending' | 'late' | 'overdue' | 'cancelled';

@Entity('invoices')
export class Invoice {
  @PrimaryColumn()
  id!: string;

  @Column()
  @Index()
  tenant!: string;

  /** Associated subscription ID in nola-billing (when generated from a subscription). */
  @Column({ type: 'varchar', length: 64, name: 'subscription_id', nullable: true })
  @Index()
  subscriptionId!: string | null;

  @Column({ type: 'integer' })
  amt!: number;

  /** ISO 4217 code (e.g. 'USD', 'CDF') — never assumed or dropped. */
  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency!: string;

  @Column()
  due!: string;

  @Column({ type: 'varchar' })
  @Index()
  status!: InvoiceStatus;

  /** Payment method/rail (e.g. 'mobile_money', 'card', 'bank_transfer', 'mpesa', 'airtel'). */
  @Column()
  method!: string;

  @Column()
  issued!: string;
}
