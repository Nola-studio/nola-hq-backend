import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('plans')
export class Plan {
  @PrimaryColumn()
  id!: string;

  @Column()
  name!: string;

  @Column({ type: 'integer', name: 'price_cdf' })
  priceCdf!: number;

  @Column()
  users!: string;

  @Column()
  features!: string;

  @Column({ type: 'integer', default: 0 })
  tenants!: number;

  @Column()
  color!: string;
}
