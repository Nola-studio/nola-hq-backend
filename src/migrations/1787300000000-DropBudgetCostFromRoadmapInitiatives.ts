import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `ProjectBudget` (revenue/expense in CDF, wired into invoices/expenses/
 * margin via the Business module) is now the single source of truth for a
 * project's financials. `roadmap_initiatives.budget`/`.cost` (USD, added by
 * `1786800000000-AddBudgetCostToRoadmapInitiatives`) were a second,
 * disconnected figure nothing else read — dropped here.
 *
 * Verified against production before writing this: both columns are
 * NULL on every row, so `down()` is a lossless, exact reversal.
 */
export class DropBudgetCostFromRoadmapInitiatives1787300000000 implements MigrationInterface {
  name = 'DropBudgetCostFromRoadmapInitiatives1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" DROP COLUMN "cost"`);
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" DROP COLUMN "budget"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" ADD COLUMN "budget" numeric(12,2)`);
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" ADD COLUMN "cost" numeric(12,2)`);
  }
}
