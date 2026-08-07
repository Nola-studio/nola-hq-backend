import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `country` — ISO 3166-1 alpha-2, nullable. Plain `varchar(2)` rather than
 * a Postgres enum: today it's just Canada (`CA`) and DRC (`CD`), validated
 * at the DTO layer (`IsIn`), but a third country should be a code change
 * only, not a migration.
 */
export class AddCountryToRoadmapInitiatives1787000000000 implements MigrationInterface {
  name = 'AddCountryToRoadmapInitiatives1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" ADD COLUMN "country" character varying(2)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" DROP COLUMN "country"`);
  }
}
