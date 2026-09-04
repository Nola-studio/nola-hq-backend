import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudioExpenseVoidReason1790400000000 implements MigrationInterface {
  name = 'StudioExpenseVoidReason1790400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "studio_expenses" ADD COLUMN IF NOT EXISTS "void_reason" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "studio_expenses" DROP COLUMN IF EXISTS "void_reason"`,
    );
  }
}
