import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('health_entries')
export class HealthEntry {
  @PrimaryColumn()
  id!: string;

  @Column()
  name!: string;

  @Column({ type: 'real' })
  uptime!: number;

  @Column({ type: 'integer' })
  p50!: number;

  @Column({ type: 'integer' })
  p99!: number;

  @Column({ type: 'integer', name: 'errors_24h' })
  errors24h!: number;

  @Column({ type: 'varchar' })
  status!: 'operational' | 'degraded';

  @Column({ type: 'simple-json' })
  series!: number[];
}
