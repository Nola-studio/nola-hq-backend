import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `products` had no lifecycle at all — full CRUD is being added, and
 * deleting a product that's already in use elsewhere isn't safe to assume
 * away, so it gets the same `archived` toggle `roadmap_initiatives` already
 * has rather than a hard delete as the only option.
 */
export class ProductArchived1788800000000 implements MigrationInterface {
  name = 'ProductArchived1788800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" ADD COLUMN "archived" boolean NOT NULL DEFAULT false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "archived"`);
  }
}
