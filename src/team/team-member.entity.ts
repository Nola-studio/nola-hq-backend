import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('team_members')
export class TeamMember {
  @PrimaryColumn()
  id!: string;

  @Column()
  name!: string;

  @Column()
  role!: string;

  @Column()
  tag!: string;

  @Column()
  avatar!: string;

  @Column({ type: 'integer' })
  hue!: number;

  @Column({ default: false })
  online!: boolean;

  @Column({ unique: true })
  email!: string;

  @Column({ length: 2 })
  country!: string;

  @Column({ type: 'simple-json' })
  perms!: string[];

  @Column()
  last!: string;

  @Column({ name: 'password_hash', nullable: true })
  passwordHash?: string;
}
