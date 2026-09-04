import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export const EXECUTION_REFERENCE_ORIGINS = ['internal', 'product', 'partner'] as const;
export type ExecutionReferenceOrigin = (typeof EXECUTION_REFERENCE_ORIGINS)[number];

export const EXECUTION_REFERENCE_FORMATS = ['markdown', 'json', 'yaml'] as const;
export type ExecutionReferenceFormat = (typeof EXECUTION_REFERENCE_FORMATS)[number];

/**
 * `received` is all lot 1.1 can produce: parsing, validation and publication
 * arrive with the manifest lots, and the states are declared now so the column
 * never has to widen under a deployed table.
 */
export const EXECUTION_REFERENCE_STATUSES = [
  'received',
  'parsed',
  'validated',
  'published',
  'rejected',
] as const;
export type ExecutionReferenceStatus = (typeof EXECUTION_REFERENCE_STATUSES)[number];

/** 1 Mo. The v1.3 referential is ~90 Ko, so this is generous by an order of magnitude. */
export const MAX_REFERENCE_CONTENT_BYTES = 1_000_000;

/**
 * An execution reference — a document that describes work NolaaStudio intends
 * to carry out, for the group, a product, a project or an approved third
 * party (EXE-01).
 *
 * The reference is the *identity*; its content lives in
 * `ExecutionReferenceVersion` and is never edited in place. `key` is the
 * stable handle used to reconcile one version against the next, so it is
 * unique and never reassigned — that reconciliation is what stops a new
 * version from recreating epics that already exist (EXE-06).
 */
@Entity('execution_references')
export class ExecutionReference {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** e.g. `REF-NOLAAHQ` — stable, uppercase, never reassigned. */
  @Column({ type: 'varchar', length: 64, unique: true })
  key!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  /** Functional domain this reference speaks to (§4A). */
  @Column({ type: 'uuid', name: 'domain_id', nullable: true })
  @Index()
  domainId!: string | null;

  @Column({ type: 'uuid', name: 'product_id', nullable: true })
  productId!: string | null;

  /** `roadmap_initiatives.id` — soft reference, like `StudioDomain.linkedProjectId`. */
  @Column({ type: 'uuid', name: 'project_id', nullable: true })
  projectId!: string | null;

  @Column({ type: 'varchar', length: 24, default: 'internal' })
  origin!: ExecutionReferenceOrigin;

  /** Team member email — soft reference, the person answerable for this document. */
  @Column({ type: 'varchar', length: 160 })
  owner!: string;

  /**
   * The most recently *received* version.
   *
   * Deliberately not called `current`: until validation exists, "newest" and
   * "authoritative" are the same thing, and naming it `current` would promise
   * a publication workflow this lot does not have. A published-version
   * pointer arrives with EXE-04.
   */
  @Column({ type: 'uuid', name: 'latest_version_id', nullable: true })
  latestVersionId!: string | null;

  @OneToMany(() => ExecutionReferenceVersion, (version) => version.reference)
  versions?: ExecutionReferenceVersion[];

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}

/**
 * One immutable revision of a reference.
 *
 * Nothing here is patchable by design: EXE-01 requires that the original
 * document is never silently replaced, so a correction is a new row with a new
 * `version`, not an edit. `UQ_execution_reference_versions_ref_version` is what
 * enforces that — re-sending `1.3` with different text is a conflict the sender
 * has to resolve by naming the new version, not a silent overwrite.
 *
 * `contentHash` is the integrity fingerprint EXE-01 asks for, computed
 * server-side: a client cannot assert its own hash.
 */
@Entity('execution_reference_versions')
@Unique('UQ_execution_reference_versions_ref_version', ['referenceId', 'version'])
export class ExecutionReferenceVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'reference_id' })
  @Index()
  referenceId!: string;

  @ManyToOne(() => ExecutionReference, (reference) => reference.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reference_id' })
  reference?: ExecutionReference;

  /** As declared by the document itself (`1.3`), not an internal counter. */
  @Column({ type: 'varchar', length: 32 })
  version!: string;

  @Column({ type: 'varchar', length: 24, default: 'received' })
  @Index()
  status!: ExecutionReferenceStatus;

  @Column({ type: 'varchar', length: 16 })
  format!: ExecutionReferenceFormat;

  /** The original document, byte for byte. Never rewritten. */
  @Column({ type: 'text' })
  content!: string;

  /** SHA-256 of `content`, computed server-side. */
  @Column({ type: 'varchar', length: 64, name: 'content_hash' })
  @Index()
  contentHash!: string;

  @Column({ type: 'integer', name: 'size_bytes' })
  sizeBytes!: number;

  /** Who or what transmitted it — an email today, a client id once EXE-02 lands. */
  @Column({ type: 'varchar', length: 160, name: 'received_from' })
  receivedFrom!: string;

  @Column({ type: 'timestamp', name: 'received_at' })
  receivedAt!: Date;

  /** `YYYY-MM-DD` — when the document takes effect, which is not when it arrived. */
  @Column({ type: 'date', name: 'effective_date', nullable: true })
  effectiveDate!: string | null;

  @Column({ type: 'varchar', length: 160, name: 'published_by', nullable: true })
  publishedBy!: string | null;

  @Column({ type: 'timestamp', name: 'published_at', nullable: true })
  publishedAt!: Date | null;
}
