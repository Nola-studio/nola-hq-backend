import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lot 1.6 — mémoire des commandes idempotentes de l'API publique (§5.7).
 *
 * En base et non en mémoire : une clé d'idempotence qui disparaît au
 * redéploiement ne protège de rien, puisque c'est justement après un timeout
 * qu'un intégrateur réessaie. L'unicité est portée par `(client_id,
 * idempotency_key)` — deux intégrations peuvent choisir la même clé sans se
 * marcher dessus.
 */
export class ApiIdempotencyKeys1790900000000 implements MigrationInterface {
  name = 'ApiIdempotencyKeys1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "api_idempotency_keys" (` +
        `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
        `"client_id" character varying(160) NOT NULL, ` +
        `"idempotency_key" character varying(200) NOT NULL, ` +
        `"endpoint" character varying(300) NOT NULL, ` +
        `"request_hash" character varying(64) NOT NULL, ` +
        `"status_code" integer NOT NULL, ` +
        `"response_body" text NOT NULL, ` +
        `"created_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_api_idempotency_keys" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "UQ_api_idempotency_client_key" UNIQUE ("client_id", "idempotency_key"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_api_idempotency_keys_created_at" ` +
        `ON "api_idempotency_keys" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "api_idempotency_keys"`);
  }
}
