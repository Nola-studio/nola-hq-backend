import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudioExpenseTemplateId1789900000000 implements MigrationInterface {
  name = 'StudioExpenseTemplateId1789900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "studio_expenses" ADD COLUMN IF NOT EXISTS "template_id" character varying(64)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "studio_expenses" DROP COLUMN IF EXISTS "template_id"`,
    );
  }
}
