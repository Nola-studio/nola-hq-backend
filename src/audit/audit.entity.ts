import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('audit_entries')
export class AuditEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  @Index()
  ts!: string;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column()
  actor!: string;

  @Column()
  @Index()
  action!: string;

  @Column()
  target!: string;

  @Column()
  ip!: string;

  @Column()
  meta!: string;
}
