import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Où en est une version.
 *
 * `cancelled` plutôt qu'une suppression : une version abandonnée a porté du
 * travail, et l'effacer laisserait des epics pointant vers rien. Elle sort des
 * listes, son histoire reste.
 */
export const RELEASE_STATUSES = ['planned', 'in_progress', 'released', 'cancelled'] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

/**
 * Une version de Nolaa HQ (REL-00).
 *
 * C'est l'objet qui manquait pour que « déployer la 1.4 » veuille dire quelque
 * chose. Un epic vise une version ; une version sait donc ce qu'elle contient,
 * ce qui reste à faire, et quand elle est partie.
 *
 * Un champ texte sur le ticket aurait suffi à filtrer — et rien d'autre.
 * « 1.4 », « v1.4 » et « 1.4.0 » y seraient devenus trois versions distinctes,
 * et un déploiement n'aurait eu nulle part où se rattacher. Le référentiel le
 * dit à sa façon : REL-00 est la dépendance déclarée de REL-01 et REL-03.
 */
@Entity('releases')
export class Release {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Le numéro, tel qu'on l'écrit — « 1.4.0 », « 2026.10 ». Unique, et
   * c'est tout : imposer le versionnage sémantique exclurait les numéros de
   * date, que d'autres produits du groupe utilisent.
   */
  @Column({ type: 'varchar', length: 32, unique: true })
  version!: string;

  /** Un nom de code, quand l'équipe en donne un. Facultatif. */
  @Column({ type: 'varchar', length: 160, nullable: true })
  name!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'planned' })
  @Index()
  status!: ReleaseStatus;

  /** La date visée, tant qu'elle n'est pas partie. */
  @Column({ type: 'date', name: 'target_date', nullable: true })
  targetDate!: string | null;

  /** Quand elle est réellement partie — nul tant qu'elle ne l'est pas. */
  @Column({ type: 'timestamp', name: 'released_at', nullable: true })
  releasedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
