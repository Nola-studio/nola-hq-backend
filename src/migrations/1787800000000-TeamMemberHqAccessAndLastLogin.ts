import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `team_members`: adds `hq_access` (persisted, kept in sync with the
 * `hq:*` Keycloak realm role by `TeamService.update()`) and `notify_email`
 * (Owner-editable, where ticket notifications actually go — falls back to
 * `email` when null), and replaces the vestigial `last` string column
 * (only ever held the literal `'jamais'`, never updated after invite —
 * see `TeamService.invite()`) with a real `last_login_at` timestamp,
 * written best-effort by `AuthService.login()`.
 *
 * `hq_access` is left null for every existing row — there's no way to
 * backfill it from a plain SQL migration (it requires calling out to
 * Keycloak per member); `POST /team/backfill-hq-access` does that instead,
 * on demand, Owner-only.
 */
export class TeamMemberHqAccessAndLastLogin1787800000000 implements MigrationInterface {
  name = 'TeamMemberHqAccessAndLastLogin1787800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "team_members" ADD "hq_access" character varying`);
    await queryRunner.query(`ALTER TABLE "team_members" ADD "notify_email" character varying`);
    await queryRunner.query(`ALTER TABLE "team_members" ADD "last_login_at" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "team_members" DROP COLUMN "last"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "team_members" ADD "last" character varying NOT NULL DEFAULT 'jamais'`);
    await queryRunner.query(`ALTER TABLE "team_members" DROP COLUMN "last_login_at"`);
    await queryRunner.query(`ALTER TABLE "team_members" DROP COLUMN "notify_email"`);
    await queryRunner.query(`ALTER TABLE "team_members" DROP COLUMN "hq_access"`);
  }
}
