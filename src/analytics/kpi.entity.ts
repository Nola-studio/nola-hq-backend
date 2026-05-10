import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('kpis')
export class Kpi {
  @PrimaryColumn()
  id!: string;

  @Column()
  label!: string;

  @Column({ type: 'real' })
  value!: number;

  @Column()
  unit!: string;

  @Column({ type: 'real' })
  delta!: number;

  @Column({ type: 'simple-json' })
  series!: number[];

  @Column({ name: 'invert_color', default: false })
  invertColor!: boolean;
}
