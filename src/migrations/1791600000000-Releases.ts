import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Le registre des versions (REL-00) et la version visée d'un ticket.
 *
 * `ON DELETE SET NULL` sur le ticket : une version supprimée ne doit pas
 * emporter le travail qui la visait. C'est d'ailleurs pour ça que le statut
 * `cancelled` existe — on annule une version, on ne la supprime pas.
 *
 * `release_id` est nullable et sans reprise : la quasi-totalité du backlog
 * existant ne vise aucune version, et lui en inventer une serait une décision
 * de planification prise par une migration.
 */
export class Releases1791600000000 implements MigrationInterface {
  name = 'Releases1791600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "releases" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"version" character varying(32) NOT NULL, ` +
        `"name" character varying(160), ` +
        `"status" character varying(16) NOT NULL DEFAULT 'planned', ` +
        `"target_date" date, ` +
        `"released_at" TIMESTAMP, ` +
        `"notes" text, ` +
        `"created_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `"updated_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_releases" PRIMARY KEY ("id"), ` +
        // Deux « 1.4 » rendraient le filtre inutilisable et le déploiement
        // ambigu — c'est précisément ce que le champ texte ne savait pas
        // empêcher.
        `CONSTRAINT "UQ_releases_version" UNIQUE ("version"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_releases_status" ON "releases" ("status")`);

    await queryRunner.query(`ALTER TABLE "work_items" ADD "release_id" uuid`);
    await queryRunner.query(`CREATE INDEX "IDX_work_items_release" ON "work_items" ("release_id")`);
    await queryRunner.query(
      `ALTER TABLE "work_items" ADD CONSTRAINT "FK_work_items_release" ` +
        `FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "work_items" DROP CONSTRAINT "FK_work_items_release"`);
    await queryRunner.query(`DROP INDEX "IDX_work_items_release"`);
    await queryRunner.query(`ALTER TABLE "work_items" DROP COLUMN "release_id"`);
    await queryRunner.query(`DROP INDEX "IDX_releases_status"`);
    await queryRunner.query(`DROP TABLE "releases"`);
  }
}
