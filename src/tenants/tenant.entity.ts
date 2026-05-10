import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type TenantStatus =
  | 'healthy'
  | 'attention'
  | 'trial'
  | 'onboarding'
  | 'churn-risk'
  | 'suspended';

@Entity('tenants')
export class Tenant {
  @PrimaryColumn()
  id!: string;

  @Column()
  name!: string;

  @Column({ length: 2 })
  @Index()
  country!: string;

  @Column()
  city!: string;

  @Column({ type: 'simple-json' })
  apps!: string[];

  @Column()
  @Index()
  plan!: string;

  @Column({ type: 'integer', name: 'mrr_cdf', default: 0 })
  mrrCdf!: number;

  @Column({ type: 'varchar' })
  @Index()
  status!: TenantStatus;

  @Column()
  since!: string;

  @Column({ type: 'integer', default: 0 })
  users!: number;

  @Column()
  owner!: string;

  @Column()
  whatsapp!: string;

  @Column({ name: 'mobile_money' })
  mobileMoney!: string;

  @Column({ type: 'integer', name: 'ar_days', default: 0 })
  arDays!: number;

  @Column({ type: 'integer', nullable: true })
  nps!: number | null;
}
