import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type PipelineStageId =
  | 'prospect'
  | 'demo'
  | 'trial'
  | 'signed'
  | 'onboarded';

@Entity('pipeline_items')
export class PipelineItem {
  @PrimaryColumn()
  id!: string;

  @Column({ type: 'varchar' })
  @Index()
  stage!: PipelineStageId;

  @Column()
  name!: string;

  @Column({ length: 2 })
  country!: string;

  @Column({ type: 'integer' })
  amt!: number;

  @Column()
  owner!: string;

  @Column()
  age!: string;
}
