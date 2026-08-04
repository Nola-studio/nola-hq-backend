import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Expand-only migration — three new nullable/defaulted columns on the
 * existing `studio_projects` table, no row touched otherwise:
 *
 *   - `description` (text, nullable)
 *   - `color`        (varchar(7), NOT NULL — defaulted so any pre-existing
 *      row backfills cleanly; the app always sends an explicit value on
 *      create from here on)
 *   - `owner_email`  (varchar(120), nullable — soft reference to
 *      `team_members.email`, same convention as `assignee_email` /
 *      `paid_by_email` elsewhere in Studio)
 *
 * `status` stays a plain unconstrained varchar (no CHECK/DB enum) — the
 * app narrows its accepted values to `active` | `archived` going forward,
 * same non-migration-needed pattern used for `StudioTaskStatus`'s
 * `blocked` addition.
 */
export class StudioProjectFields1786200000000 implements MigrationInterface {
  name = 'StudioProjectFields1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "studio_projects" ADD COLUMN "description" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "studio_projects" ADD COLUMN "color" character varying(7) NOT NULL DEFAULT '#94A3B8'`,
    );
    await queryRunner.query(
      `ALTER TABLE "studio_projects" ADD COLUMN "owner_email" character varying(120)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "studio_projects" DROP COLUMN "owner_email"`);
    await queryRunner.query(`ALTER TABLE "studio_projects" DROP COLUMN "color"`);
    await queryRunner.query(`ALTER TABLE "studio_projects" DROP COLUMN "description"`);
  }
}
