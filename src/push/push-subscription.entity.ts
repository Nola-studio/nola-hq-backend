import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Un abonnement Web Push = un appareil (navigateur/PWA installée) d'un
 * membre de l'équipe HQ. L'`endpoint` est unique par construction côté
 * push service du navigateur — c'est notre clé naturelle ; `userId` ne
 * sert qu'à scoper la suppression et le test « m'envoyer une notif ».
 */
@Entity('push_subscriptions')
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** `sub` Keycloak du membre qui a activé les notifs sur cet appareil. */
  @Column({ name: 'user_id' })
  @Index()
  userId!: string;

  /** Email au moment de l'abonnement — affichage/debug uniquement. */
  @Column({ type: 'varchar', length: 320, nullable: true })
  email!: string | null;

  @Column({ type: 'text', unique: true })
  endpoint!: string;

  /** Clé publique ECDH du navigateur (chiffrement du payload). */
  @Column({ type: 'text' })
  p256dh!: string;

  /** Secret d'authentification du navigateur. */
  @Column({ type: 'text' })
  auth!: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent!: string | null;

  @Column({ name: 'created_at' })
  createdAt!: Date;
}
