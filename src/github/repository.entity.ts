import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Product } from '../company/product.entity';
import { Domain } from '../domains/domain.entity';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';

/**
 * Un seul fournisseur aujourd'hui, une colonne quand même : la migration qui
 * ajouterait `gitlab` plus tard ne doit pas être un renommage de table.
 */
export const REPOSITORY_PROVIDERS = ['github'] as const;
export type RepositoryProvider = (typeof REPOSITORY_PROVIDERS)[number];

export const REPOSITORY_VISIBILITIES = ['public', 'private', 'internal'] as const;
export type RepositoryVisibility = (typeof REPOSITORY_VISIBILITIES)[number];

/**
 * Un dépôt de code connu de Nolaa HQ (ENG-06).
 *
 * `CodeRepository` et non `Repository` : ce dernier est le nom du dépôt de
 * données de TypeORM, et les deux se croisent dans chaque service qui touche
 * à cette table.
 *
 * HQ ne copie pas GitHub : le code, les commits et les pull requests y restent
 * canoniques. Ce que HQ conserve, c'est de quoi *piloter* — quel dépôt sert
 * quel produit, qui en répond, et quels projets ont le droit d'y ouvrir une
 * branche. C'est la condition d'ENG-08 : « seuls les repositories autorisés
 * pour le produit ou projet sont proposés » n'a rien à proposer sans cette
 * table.
 */
@Entity('repositories')
@Unique('UQ_repositories_provider_owner_name', ['provider', 'owner', 'name'])
export class CodeRepository {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16, default: 'github' })
  @Index()
  provider!: RepositoryProvider;

  /**
   * Le propriétaire au sens de GitHub — l'organisation ou le compte, la
   * première moitié de `nola-studio/nola-hq`. Ce n'est pas une personne : le
   * responsable humain, c'est `steward`.
   */
  @Column({ type: 'varchar', length: 120 })
  owner!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  /**
   * L'identifiant que le fournisseur donne au dépôt.
   *
   * `owner/name` est ce qu'un humain lit, mais un dépôt se renomme et se
   * transfère : c'est cet identifiant-là qui survit, et c'est donc lui qui
   * fera le rapprochement quand la synchronisation arrivera. Nullable tant
   * qu'un dépôt est saisi à la main avant d'avoir été vu par l'API.
   */
  @Column({ type: 'varchar', length: 64, name: 'external_id', nullable: true })
  @Index()
  externalId!: string | null;

  /**
   * La branche de base par défaut d'une nouvelle branche de travail. Le
   * référentiel exige qu'elle « respecte la politique du repository » — HQ
   * garde donc ce que GitHub déclare plutôt que de supposer `main`.
   */
  @Column({ type: 'varchar', length: 255, name: 'default_branch', default: 'main' })
  defaultBranch!: string;

  @Column({ type: 'varchar', length: 16, default: 'private' })
  visibility!: RepositoryVisibility;

  /** Un dépôt archivé reste lisible et référencé ; il n'est plus proposé. */
  @Column({ type: 'boolean', default: false })
  archived!: boolean;

  @Column({ type: 'varchar', length: 400, name: 'html_url', nullable: true })
  htmlUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** Le produit que ce dépôt sert. Nullable : un outil interne n'en a pas. */
  @Column({ type: 'uuid', name: 'product_id', nullable: true })
  @Index()
  productId!: string | null;

  @ManyToOne(() => Product, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'product_id' })
  product?: Product | null;

  /** Domaine fonctionnel (§4A) — D06 pour l'essentiel, mais pas toujours. */
  @Column({ type: 'uuid', name: 'domain_id', nullable: true })
  @Index()
  domainId!: string | null;

  @ManyToOne(() => Domain, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'domain_id' })
  domain?: Domain | null;

  /**
   * Qui répond de ce dépôt. Référence souple vers un membre d'équipe, comme
   * `WorkItem.assignee` : un départ ne doit pas effacer le dépôt.
   */
  @Column({ type: 'varchar', length: 160, nullable: true })
  steward!: string | null;

  /** Dernier rapprochement réussi avec le fournisseur. Nul = jamais synchronisé. */
  @Column({ type: 'timestamp', name: 'last_synced_at', nullable: true })
  lastSyncedAt!: Date | null;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}

/**
 * Quels projets ont le droit d'ouvrir une branche dans quel dépôt.
 *
 * Une table de liaison plutôt qu'une colonne : un dépôt sert souvent
 * plusieurs projets (une API partagée), et un projet touche souvent plusieurs
 * dépôts (front + back). Le référentiel dit les deux — « un work item peut
 * être lié à plusieurs repositories lorsque le travail est réellement
 * multi-composant ».
 */
@Entity('repository_projects')
@Unique('UQ_repository_projects_pair', ['repositoryId', 'projectId'])
export class RepositoryProject {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'repository_id' })
  @Index()
  repositoryId!: string;

  @ManyToOne(() => CodeRepository, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'repository_id' })
  repository?: CodeRepository;

  @Column({ type: 'uuid', name: 'project_id' })
  @Index()
  projectId!: string;

  @ManyToOne(() => RoadmapInitiative, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project?: RoadmapInitiative;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
