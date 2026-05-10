import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

@Entity('logs')
export class LogEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  @Index()
  ts!: string;

  @Column({ name: 'created_at' })
  @Index()
  createdAt!: Date;

  @Column()
  @Index()
  svc!: string;

  @Column({ type: 'varchar' })
  @Index()
  lvl!: LogLevel;

  @Column({ type: 'text' })
  msg!: string;
}
