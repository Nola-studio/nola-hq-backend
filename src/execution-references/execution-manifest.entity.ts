import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type {
  ParsedItemKind,
  ParsedPriority,
  ParseIssue,
  ParsedSurface,
} from './execution-reference.parser';

export const MANIFEST_SCHEMA_VERSION = '1';

/**
 * The structured, reviewable form of one reference version (EXE-04).
 *
 * It exists so that reading a document and changing the backlog stay two
 * separate acts: parsing writes only here, and nothing operational moves until
 * someone imports. Re-parsing replaces the manifest — it is derived data, and
 * the version it came from is immutable, so it can always be rebuilt.
 */
@Entity('execution_manifests')
export class ExecutionManifest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** One manifest per version — re-parsing replaces it rather than piling up. */
  @Column({ type: 'uuid', name: 'version_id', unique: true })
  versionId!: string;

  /** Version of the manifest *shape*, not of the document. */
  @Column({ type: 'varchar', length: 8, name: 'schema_version', default: MANIFEST_SCHEMA_VERSION })
  schemaVersion!: string;

  /** Errors and warnings the parser raised, kept so a reviewer sees what it could not read. */
  @Column({ type: 'simple-json', name: 'issues', default: '[]' })
  issues!: ParseIssue[];

  /**
   * Le projet que le document déclare, tel qu'écrit — « NolaHQ ». Gardé brut :
   * c'est l'import qui le résout contre le registre, et un document dont le
   * projet a été renommé doit continuer à dire ce qu'il disait.
   */
  @Column({ type: 'varchar', length: 160, name: 'project_label', nullable: true })
  projectLabel!: string | null;

  @Column({ type: 'varchar', length: 160, name: 'parsed_by' })
  parsedBy!: string;

  @Column({ type: 'timestamp', name: 'parsed_at' })
  parsedAt!: Date;

  @OneToMany(() => ExecutionManifestItem, (item) => item.manifest)
  items?: ExecutionManifestItem[];
}

/**
 * One node of the parsed taxonomy, with the provenance that lets HQ answer
 * "why does this backlog item exist?" (EXE-07).
 *
 * `sourceKey` is the document's own key, and it is what reconciles a later
 * version against this one — never the title, never the position.
 */
@Entity('execution_manifest_items')
export class ExecutionManifestItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'manifest_id' })
  @Index()
  manifestId!: string;

  @ManyToOne(() => ExecutionManifest, (manifest) => manifest.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'manifest_id' })
  manifest?: ExecutionManifest;

  @Column({ type: 'varchar', length: 16 })
  kind!: ParsedItemKind;

  @Column({ type: 'varchar', length: 64, name: 'source_key' })
  @Index()
  sourceKey!: string;

  @Column({ type: 'varchar', length: 64, name: 'parent_key', nullable: true })
  parentKey!: string | null;

  @Column({ type: 'varchar', length: 300 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  @Column({ type: 'varchar', length: 4, nullable: true })
  priority!: ParsedPriority | null;

  /** Backend, frontend, les deux — ce que le document a dit, rien de deviné. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  surface!: ParsedSurface | null;

  /**
   * Le numéro de version visé, tel qu'écrit dans le document. Gardé brut :
   * c'est l'import qui le résout contre le registre, et un document dont la
   * version a été renommée doit continuer à dire ce qu'il disait.
   */
  @Column({ type: 'varchar', length: 32, name: 'target_version', nullable: true })
  targetVersion!: string | null;

  @Column({ type: 'varchar', length: 200, name: 'source_section_id' })
  sourceSectionId!: string;

  @Column({ type: 'varchar', length: 64, name: 'source_excerpt_hash' })
  sourceExcerptHash!: string;

  /** 1-based line in the source document — for a human to find the section. */
  @Column({ type: 'integer', name: 'source_line' })
  sourceLine!: number;
}
