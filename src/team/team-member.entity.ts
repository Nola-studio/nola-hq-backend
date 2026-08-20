import { Column, Entity, PrimaryColumn } from 'typeorm';

export const TEAM_HQ_ACCESS_LEVELS = ['viewer', 'operator', 'owner'] as const;
export type TeamHqAccessLevel = (typeof TEAM_HQ_ACCESS_LEVELS)[number];

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

  /**
   * Unused beyond storage/display — no guard anywhere reads this to gate
   * access (only `hqAccess` is checked, via the `hq:*` Keycloak realm
   * role). Kept on the entity and echoed in `/auth/me` for now (no
   * migration), but the frontend no longer collects or displays it —
   * a decorative permissions list on an access-control page reads as
   * enforcement it isn't.
   */
  @Column({ type: 'simple-json' })
  perms!: string[];

  /**
   * Persisted HQ realm-role level, kept in sync with the `hq:*` Keycloak
   * realm role by `TeamService` — null when never provisioned/backfilled
   * (e.g. a Keycloak account that predates this column).
   */
  @Column({ type: 'varchar', name: 'hq_access', nullable: true })
  hqAccess?: TeamHqAccessLevel | null;

  /**
   * Editable by an Owner — where ticket notifications are actually sent.
   * Falls back to `email` (the Keycloak login address) when null.
   */
  @Column({ type: 'varchar', name: 'notify_email', nullable: true })
  notifyEmail?: string | null;

  /** Best-effort, written on login — replaces the vestigial `last` string column. */
  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt?: Date | null;

  @Column({ type: 'varchar', name: 'password_hash', nullable: true })
  passwordHash?: string;
}
