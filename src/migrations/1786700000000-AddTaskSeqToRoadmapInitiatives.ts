import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `task_seq` — per-project monotonic counter backing the new
 * `T<keyPrefix><NN>` work item reference format. Incremented atomically on
 * every task creation (`UPDATE ... SET task_seq = task_seq + 1 RETURNING`);
 * never decremented or recomputed from existing rows, so a deleted task's
 * number is never reused.
 */
export class AddTaskSeqToRoadmapInitiatives1786700000000 implements MigrationInterface {
  name = 'AddTaskSeqToRoadmapInitiatives1786700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "roadmap_initiatives" ADD COLUMN "task_seq" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" DROP COLUMN "task_seq"`);
  }
}
