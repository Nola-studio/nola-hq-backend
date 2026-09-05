import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Le côté (backend / frontend) et le projet d'un document d'exécution.
 *
 * Quatre colonnes qui n'ont de valeur qu'ensemble : le document déclare le
 * projet qu'il sert et de quel côté chaque travail tombe, le dépôt déclare de
 * quel côté il est, et « Start Work » n'a plus de question à poser — le ticket
 * dit « backend », un seul dépôt autorisé du projet est backend, la branche
 * s'ouvre là.
 *
 * Toutes nullables, sans reprise de l'existant. Deviner le côté des cent-six
 * tickets déjà importés depuis leur titre produirait des classements faux, et
 * un classement faux coûte plus cher qu'une absence : l'absence se voit et se
 * corrige, l'erreur se propage jusqu'à une branche ouverte dans le mauvais
 * dépôt.
 */
export class SurfaceAndProject1791400000000 implements MigrationInterface {
  name = 'SurfaceAndProject1791400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "work_items" ADD "surface" character varying(16)`);
    await queryRunner.query(`ALTER TABLE "repositories" ADD "side" character varying(16)`);
    await queryRunner.query(
      `ALTER TABLE "execution_manifest_items" ADD "surface" character varying(16)`,
    );
    await queryRunner.query(
      `ALTER TABLE "execution_manifests" ADD "project_label" character varying(160)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "execution_manifests" DROP COLUMN "project_label"`);
    await queryRunner.query(`ALTER TABLE "execution_manifest_items" DROP COLUMN "surface"`);
    await queryRunner.query(`ALTER TABLE "repositories" DROP COLUMN "side"`);
    await queryRunner.query(`ALTER TABLE "work_items" DROP COLUMN "surface"`);
  }
}
