import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Donne un identifiant lisible aux tickets issus d'un référentiel.
 *
 * Un work item tire normalement sa `reference` de la séquence d'un projet.
 * Un epic du référentiel n'a pas de projet, donc les 106 items du premier
 * import sont arrivés sans identifiant : illisibles dans une liste, et
 * impossibles à citer dans une conversation.
 *
 * La clé du document (`EXE-05`, `US-GOV-01-1`) est déjà cet identifiant, et
 * c'est celui des deux côtés de la frontière. On la recopie donc plutôt que
 * d'en inventer un second.
 *
 * `reference` étant unique, la mise à jour ignore toute clé déjà prise —
 * mieux vaut un ticket sans identifiant qu'une migration qui échoue.
 */
export class BackfillManifestReferences1791000000000 implements MigrationInterface {
  name = 'BackfillManifestReferences1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "work_items" SET "reference" = SUBSTR("source_key", 1, 32) ` +
        `WHERE "reference" IS NULL AND "source_kind" = 'manifest' AND "source_key" IS NOT NULL ` +
        `AND NOT EXISTS (` +
        `SELECT 1 FROM "work_items" other ` +
        `WHERE other."reference" = SUBSTR("work_items"."source_key", 1, 32))`,
    );
  }

  /**
   * Ne retire que ce que `up` a posé : une référence identique à la clé
   * source d'un item de manifest. Un identifiant saisi à la main qui
   * ressemblerait à une clé n'est pas de notre fait et reste en place.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "work_items" SET "reference" = NULL ` +
        `WHERE "source_kind" = 'manifest' AND "reference" = SUBSTR("source_key", 1, 32)`,
    );
  }
}
