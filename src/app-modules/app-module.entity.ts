import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('app_modules')
export class AppModuleEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  app!: string;

  @Column()
  label!: string;

  @Column({ name: 'is_default', default: false })
  default!: boolean;

  @Column({ default: false })
  beta!: boolean;
}
