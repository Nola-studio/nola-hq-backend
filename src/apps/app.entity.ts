import { Column, Entity, PrimaryColumn } from 'typeorm';

export type AppStatus = 'live' | 'beta' | 'mvp' | 'dev' | 'planned';

@Entity('apps')
export class AppEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  name!: string;

  @Column()
  tag!: string;

  @Column()
  color!: string;

  @Column()
  mark!: string;

  @Column()
  version!: string;

  @Column({ type: 'varchar' })
  status!: AppStatus;

  @Column({ type: 'integer', default: 0 })
  tenants!: number;

  @Column({ type: 'integer', name: 'mrr_cdf', default: 0 })
  mrrCdf!: number;

  @Column({ type: 'real', default: 0 })
  growth30!: number;

  @Column()
  since!: string;

  @Column({ type: 'simple-json' })
  modules!: string[];
}
