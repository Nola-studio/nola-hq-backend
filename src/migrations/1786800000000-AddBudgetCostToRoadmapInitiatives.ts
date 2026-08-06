import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `budget`/`cost` — USD, no currency column, same `numeric(12,2)` shape the
 * retired `studio_projects` table used for these two fields (see
 * `1786600000000-DropStudioProjectsAndTasks.ts`'s own `down()`). Both
 * nullable: most projects have neither set.
 */
export class AddBudgetCostToRoadmapInitiatives1786800000000 implements MigrationInterface {
  name = 'AddBudgetCostToRoadmapInitiatives1786800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" ADD COLUMN "budget" numeric(12,2)`);
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" ADD COLUMN "cost" numeric(12,2)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" DROP COLUMN "cost"`);
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" DROP COLUMN "budget"`);
  }
}
