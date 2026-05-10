import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('countries')
export class Country {
  @PrimaryColumn({ length: 2 })
  id!: string;

  @Column()
  name!: string;

  @Column()
  flag!: string;

  @Column({ type: 'simple-json' })
  cities!: string[];
}
