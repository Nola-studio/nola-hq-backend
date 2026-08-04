import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export const BUSINESS_CLIENT_STATUSES = ['prospect', 'active', 'inactive'] as const;
export type BusinessClientStatus = (typeof BUSINESS_CLIENT_STATUSES)[number];

@Entity('business_clients')
export class BusinessClient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 180 })
  @Index()
  name!: string;

  @Column({ type: 'varchar', length: 24, default: 'prospect' })
  @Index()
  status!: BusinessClientStatus;

  @Column({ type: 'varchar', length: 160, nullable: true })
  contactName!: string | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  country!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  owner!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
