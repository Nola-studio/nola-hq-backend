import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Le journal des livraisons GitHub (ENG-06, lot 2.2).
 *
 * L'unicité de `delivery_id` n'est pas un détail d'hygiène : c'est elle qui
 * rend le rejeu inoffensif. GitHub réémet toute livraison qui n'a pas répondu
 * 200, et deux rejeux peuvent se croiser — la contrainte tranche là où une
 * lecture préalable laisserait une fenêtre.
 */
export class GithubWebhookDeliveries1791200000000 implements MigrationInterface {
  name = 'GithubWebhookDeliveries1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "github_webhook_deliveries" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"delivery_id" character varying(64) NOT NULL, ` +
        `"event" character varying(64) NOT NULL, ` +
        `"action" character varying(64), ` +
        `"repository_id" uuid, ` +
        `"repository_slug" character varying(250), ` +
        `"repository_external_id" character varying(64), ` +
        `"status" character varying(16) NOT NULL DEFAULT 'received', ` +
        `"detail" text, ` +
        `"payload" text NOT NULL, ` +
        `"received_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_github_webhook_deliveries" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "UQ_github_webhook_deliveries_delivery_id" UNIQUE ("delivery_id"))`,
    );

    // `SET NULL` : le journal survit à la sortie d'un dépôt du registre. Ce
    // qui s'est passé s'est passé, même si HQ ne suit plus le dépôt.
    await queryRunner.query(
      `ALTER TABLE "github_webhook_deliveries" ADD CONSTRAINT "FK_github_webhook_deliveries_repository" ` +
        `FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE SET NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_github_webhook_deliveries_event" ON "github_webhook_deliveries" ("event")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_github_webhook_deliveries_repository_id" ON "github_webhook_deliveries" ("repository_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_github_webhook_deliveries_repository_slug" ON "github_webhook_deliveries" ("repository_slug")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_github_webhook_deliveries_status" ON "github_webhook_deliveries" ("status")`,
    );
    // Le journal se lit toujours du plus récent au plus ancien.
    await queryRunner.query(
      `CREATE INDEX "IDX_github_webhook_deliveries_received_at" ON "github_webhook_deliveries" ("received_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "github_webhook_deliveries"`);
  }
}
