import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** Combien de temps une clé rejoue avant d'être oubliée. */
export const IDEMPOTENCY_TTL_HOURS = 24;

/**
 * Une commande déjà exécutée, mémorisée pour pouvoir la rejouer à
 * l'identique (§5.7 — « idempotence des commandes »).
 *
 * En base et non en mémoire, délibérément : une clé d'idempotence qui
 * s'évapore au redéploiement ne protège de rien, puisque c'est précisément
 * quand un intégrateur réessaie après un timeout qu'elle doit tenir. C'est
 * le défaut relevé à l'audit sur le registre applicatif — autant ne pas le
 * reproduire.
 *
 * L'empreinte de la requête est conservée pour détecter la réutilisation
 * d'une clé avec un corps différent : rejouer silencieusement l'ancienne
 * réponse masquerait un bug côté appelant, la refuser le lui montre.
 */
@Entity('api_idempotency_keys')
@Unique('UQ_api_idempotency_client_key', ['clientId', 'idempotencyKey'])
export class IdempotencyKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Portée par client : deux intégrations ne se marchent pas dessus. */
  @Column({ type: 'varchar', length: 160, name: 'client_id' })
  clientId!: string;

  @Column({ type: 'varchar', length: 200, name: 'idempotency_key' })
  idempotencyKey!: string;

  @Column({ type: 'varchar', length: 300 })
  endpoint!: string;

  /** SHA-256 du corps — même clé, corps différent = erreur, pas rejeu. */
  @Column({ type: 'varchar', length: 64, name: 'request_hash' })
  requestHash!: string;

  @Column({ type: 'integer', name: 'status_code' })
  statusCode!: number;

  @Column({ type: 'text', name: 'response_body' })
  responseBody!: string;

  @Column({ type: 'timestamp', name: 'created_at' })
  @Index()
  createdAt!: Date;
}
