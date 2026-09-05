import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CodeRepository } from './repository.entity';

export const WEBHOOK_DELIVERY_STATUSES = ['received', 'ignored', 'failed'] as const;
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

/**
 * Ce que GitHub nous a dit, et quand.
 *
 * Trois raisons de le conserver plutôt que de traiter à la volée :
 *
 *  - **La déduplication.** GitHub rejoue une livraison qui n'a pas répondu
 *    200 — jusqu'à plusieurs fois. Sans clé d'unicité sur `delivery_id`, une
 *    coupure réseau devient un doublon dans le backlog.
 *  - **La reconstruction.** ENG-09 exige de distinguer « événement observé »,
 *    « règle appliquée » et « transition résultante ». Sans le premier
 *    conservé, les deux autres sont invérifiables.
 *  - **Le diagnostic.** Une livraison ignorée parce que le dépôt est inconnu
 *    de HQ n'est pas une erreur, mais il faut pouvoir le constater sans
 *    fouiller les journaux de GitHub.
 */
@Entity('github_webhook_deliveries')
export class GithubWebhookDelivery {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * L'identifiant que GitHub attribue à la livraison (`X-GitHub-Delivery`).
   * Unique : c'est lui qui rend le rejeu inoffensif.
   */
  @Column({ type: 'varchar', length: 64, name: 'delivery_id', unique: true })
  deliveryId!: string;

  /** `push`, `pull_request`, `check_suite`… (`X-GitHub-Event`). */
  @Column({ type: 'varchar', length: 64 })
  @Index()
  event!: string;

  /** `opened`, `closed`, `synchronize`… absent sur les événements sans action. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  action!: string | null;

  /**
   * Le dépôt concerné, quand HQ le connaît. Nul si l'App est installée sur un
   * dépôt qui n'est pas au registre — cas courant et sans gravité.
   */
  @Column({ type: 'uuid', name: 'repository_id', nullable: true })
  @Index()
  repositoryId!: string | null;

  @ManyToOne(() => CodeRepository, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'repository_id' })
  repository?: CodeRepository | null;

  /** `owner/name` tel qu'annoncé, même quand le dépôt est inconnu de HQ. */
  @Column({ type: 'varchar', length: 250, name: 'repository_slug', nullable: true })
  @Index()
  repositorySlug!: string | null;

  /** L'identifiant GitHub du dépôt — survit à un renommage. */
  @Column({ type: 'varchar', length: 64, name: 'repository_external_id', nullable: true })
  repositoryExternalId!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'received' })
  @Index()
  status!: WebhookDeliveryStatus;

  /** Pourquoi une livraison a été ignorée, ou ce qui a échoué. */
  @Column({ type: 'text', nullable: true })
  detail!: string | null;

  /**
   * La charge utile vérifiée, telle que reçue.
   *
   * Conservée parce qu'elle est la preuve d'ENG-09 : sans elle, « quelle règle
   * a produit cette transition » ne se rejoue pas. Écrite seulement après
   * vérification de la signature — un corps non authentifié n'entre jamais en
   * base, sans quoi l'endpoint deviendrait un moyen de remplir le disque.
   */
  @Column({ type: 'simple-json' })
  payload!: Record<string, unknown>;

  @Column({ name: 'received_at' })
  receivedAt!: Date;
}
