import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Le lien entre un ticket et la branche qui le réalise (ENG-08, lot 2.3).
 *
 * Deux choix de suppression qui ne se ressemblent pas, et c'est voulu :
 *
 *  - `work_item_id` en CASCADE — un ticket supprimé emporte ses liens, qui
 *    ne désignent plus rien.
 *  - `repository_id` en RESTRICT — retirer du registre un dépôt où du travail
 *    est en cours effacerait ce qui explique une branche. On archive d'abord.
 */
export class WorkItemBranches1791300000000 implements MigrationInterface {
  name = 'WorkItemBranches1791300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "work_item_branches" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"work_item_id" integer NOT NULL, ` +
        `"repository_id" uuid NOT NULL, ` +
        `"name" character varying(255) NOT NULL, ` +
        `"base_branch" character varying(255) NOT NULL, ` +
        `"base_sha" character varying(40), ` +
        `"state" character varying(16) NOT NULL DEFAULT 'open', ` +
        `"created_by" character varying(160) NOT NULL, ` +
        `"created_by_hq" boolean NOT NULL DEFAULT true, ` +
        `"html_url" character varying(500), ` +
        `"created_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `"updated_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_work_item_branches" PRIMARY KEY ("id"), ` +
        // Une branche n'existe qu'une fois par dépôt : c'est ce qui rend un
        // double clic sur « Start Work » inoffensif.
        `CONSTRAINT "UQ_work_item_branches_repo_name" UNIQUE ("repository_id", "name"))`,
    );

    await queryRunner.query(
      `ALTER TABLE "work_item_branches" ADD CONSTRAINT "FK_work_item_branches_work_item" ` +
        `FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_item_branches" ADD CONSTRAINT "FK_work_item_branches_repository" ` +
        `FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE RESTRICT`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_work_item_branches_work_item_id" ON "work_item_branches" ("work_item_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_work_item_branches_repository_id" ON "work_item_branches" ("repository_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_work_item_branches_state" ON "work_item_branches" ("state")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "work_item_branches"`);
  }
}
