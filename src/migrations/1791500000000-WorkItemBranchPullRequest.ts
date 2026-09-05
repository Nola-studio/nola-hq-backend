import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La pull request d'une branche (ENG-08, lot 2.5).
 *
 * Trois colonnes nullables sur le lien existant plutôt qu'une table : une
 * branche a au plus une pull request ouverte à la fois, et la faire vivre
 * ailleurs obligerait à joindre pour répondre à « où en est ce ticket ? ».
 *
 * Nulles pour tout l'existant, sans reprise : une branche déjà ouverte sans
 * PR est un état vrai, pas une donnée manquante. Aller les chercher sur
 * GitHub au moment de la migration ferait dépendre un déploiement d'un appel
 * réseau — c'est la synchronisation qui les rattrapera, ou le webhook.
 */
export class WorkItemBranchPullRequest1791500000000 implements MigrationInterface {
  name = 'WorkItemBranchPullRequest1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "work_item_branches" ADD "pr_number" integer`);
    await queryRunner.query(`ALTER TABLE "work_item_branches" ADD "pr_url" character varying(500)`);
    await queryRunner.query(`ALTER TABLE "work_item_branches" ADD "pr_state" character varying(16)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "work_item_branches" DROP COLUMN "pr_state"`);
    await queryRunner.query(`ALTER TABLE "work_item_branches" DROP COLUMN "pr_url"`);
    await queryRunner.query(`ALTER TABLE "work_item_branches" DROP COLUMN "pr_number"`);
  }
}
