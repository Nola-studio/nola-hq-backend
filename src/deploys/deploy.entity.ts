import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type DeployStatus = 'pending' | 'success' | 'failed' | 'rolled-back';

@Entity('deploys')
export class Deploy {
  @PrimaryColumn()
  id!: string;

  @Column()
  @Index()
  app!: string;

  @Column()
  version!: string;

  @Column()
  env!: string;

  @Column()
  author!: string;

  @Column()
  t!: string;

  @Column({ type: 'varchar' })
  status!: DeployStatus;

  @Column()
  sha!: string;

  @Column({ type: 'text' })
  changelog!: string;
}
