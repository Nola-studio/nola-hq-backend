import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * « Version cible : 1.4 » dans un document d'exécution.
 *
 * Une colonne sur l'item de manifest, pas une clé étrangère vers `releases` :
 * le manifest est la lecture du document, et le document dit un numéro, pas un
 * identifiant. C'est l'import qui fait le rapprochement — et qui sait le dire
 * quand le numéro ne désigne rien.
 */
export class ManifestTargetVersion1791700000000 implements MigrationInterface {
  name = 'ManifestTargetVersion1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "execution_manifest_items" ADD "target_version" character varying(32)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "execution_manifest_items" DROP COLUMN "target_version"`);
  }
}
