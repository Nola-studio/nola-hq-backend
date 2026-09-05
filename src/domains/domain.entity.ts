import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { DomainCode } from './domains.constants';

/**
 * A permanent zone of group responsibility — the twelve of the referential's
 * §4A. Not to be confused with `studio_domains`, which holds *internet*
 * domain names (an IP asset, D04); the two collide in French, so the tables
 * are deliberately named apart.
 *
 * `code` is the stable key every other object points at, so it is unique and
 * never reassigned. `owner` is nullable on purpose: naming the twelve owners
 * is a management decision (§14.2), and the table has to exist before that
 * decision can be recorded.
 *
 * `Capability` lives in this file rather than its own, same as
 * `BusinessInvoiceLine` sits with `BusinessInvoice`: the two reference each
 * other, and splitting them across modules makes the import cycle fail at
 * class-initialization time rather than at type-check time.
 */
@Entity('domains')
export class Domain {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** `D01`..`D12` — stable, never renumbered. See `domains.constants.ts`. */
  @Column({ type: 'varchar', length: 8, unique: true })
  code!: DomainCode;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  purpose!: string | null;

  /** Team member email — soft reference, like `WorkItem.assignee`. */
  @Column({ type: 'varchar', length: 160, nullable: true })
  owner!: string | null;

  /** Display order. Independent of `code`, which must stay stable. */
  @Column({ type: 'integer', default: 0 })
  @Index()
  position!: number;

  @OneToMany(() => Capability, (capability) => capability.domain)
  capabilities?: Capability[];

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}

/**
 * A business function the group must master, under exactly one domain.
 *
 * `code` is prefixed by its domain (`D06.C03`) so a capability read on its own
 * still says where it belongs. `ON DELETE CASCADE` is right here and only
 * here: a capability has no meaning without its domain, unlike the objects
 * that merely *reference* a domain — those carry a nullable FK and `SET NULL`.
 */
@Entity('capabilities')
export class Capability {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** `D06.C03` — stable, never renumbered. */
  @Column({ type: 'varchar', length: 16, unique: true })
  code!: string;

  @Column({ type: 'uuid', name: 'domain_id' })
  @Index()
  domainId!: string;

  @ManyToOne(() => Domain, (domain) => domain.capabilities, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'domain_id' })
  domain?: Domain;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  /** Team member email — soft reference. */
  @Column({ type: 'varchar', length: 160, nullable: true })
  owner!: string | null;

  @Column({ type: 'integer', default: 0 })
  position!: number;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
