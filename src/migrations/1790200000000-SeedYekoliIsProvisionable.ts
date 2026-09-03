import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedYekoliIsProvisionable1790200000000 implements MigrationInterface {
  name = 'SeedYekoliIsProvisionable1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "products" SET "is_provisionable" = true WHERE "code" = 'yekoli'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "products" SET "is_provisionable" = false WHERE "code" = 'yekoli'`,
    );
  }
}
