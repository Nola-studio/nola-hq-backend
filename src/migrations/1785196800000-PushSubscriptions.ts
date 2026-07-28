import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Expand-only : une table neuve, rien d'existant n'est touché.
 *
 * `push_subscriptions` — un enregistrement par appareil (navigateur ou
 * PWA installée) abonné aux notifications Web Push de la console.
 * L'`endpoint` est la clé naturelle fournie par le push service du
 * navigateur, d'où l'unicité ; `user_id` (sub Keycloak) permet de
 * scoper désabonnement et notifs de test à l'appelant.
 *
 * `down` supprime exactement ce que `up` a créé.
 */
export class PushSubscriptions1785196800000 implements MigrationInterface {
  name = 'PushSubscriptions1785196800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "push_subscriptions" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"user_id" character varying NOT NULL, ` +
        `"email" character varying(320), ` +
        `"endpoint" text NOT NULL, ` +
        `"p256dh" text NOT NULL, ` +
        `"auth" text NOT NULL, ` +
        `"user_agent" character varying(512), ` +
        `"created_at" TIMESTAMP NOT NULL, ` +
        `CONSTRAINT "UQ_push_subscriptions_endpoint" UNIQUE ("endpoint"), ` +
        `CONSTRAINT "PK_push_subscriptions_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_push_subscriptions_user_id" ON "push_subscriptions" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_push_subscriptions_user_id"`);
    await queryRunner.query(`DROP TABLE "push_subscriptions"`);
  }
}
