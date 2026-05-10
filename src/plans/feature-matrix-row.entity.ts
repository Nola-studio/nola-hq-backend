import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('feature_matrix')
export class FeatureMatrixRow {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  feat!: string;

  @Column()
  free!: string;

  @Column()
  growth!: string;

  @Column()
  scale!: string;

  @Column()
  custom!: string;
}
