import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductIsProvisionable1790000000000 implements MigrationInterface {
  name = 'ProductIsProvisionable1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "is_provisionable" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" DROP COLUMN IF EXISTS "is_provisionable"`,
    );
  }
}
