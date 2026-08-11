import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renames/collapses `work_items.status` onto the new Tâches board columns
 * (À faire · En cours · Bloqué · En revue · Résolu · Fermé) and adds
 * `resolved_at`, the timestamp the 3-day reopen window and the daily
 * auto-close job (`StudioResolvedCloserScheduler`) both key off of.
 *
 * Status changes:
 *   - `backlog` → `todo` (a planning horizon doesn't belong on an
 *     execution board — that's Roadmap's job now)
 *   - `done` → `closed` directly, not `resolved`: these rows are historical
 *     and long past any 3-day reopen window already, so routing them
 *     through `resolved` would just mean the very next
 *     `StudioResolvedCloserScheduler` run auto-closes all of them in one
 *     surprise batch. `closed_at` is left as-is (it already held the
 *     completion timestamp under the pre-migration meaning of that
 *     column, which is also what "closed" means now) and `resolved_at`
 *     stays null — these tickets never went through the new `resolved`
 *     state, so there's nothing honest to backfill there.
 *   - `this_quarter`/`in_review` never existed as `WorkItem.status` values
 *     (only as Studio-vocabulary aliases already mapped to `todo`/`review`
 *     — see `work-item-studio-mapping.ts`), so no data migration is needed
 *     for them.
 *
 * `status` stays an unconstrained varchar (no CHECK/DB enum), same pattern
 * as every other status column in this codebase — the app narrows accepted
 * values going forward.
 */
export class WorkItemStatusRenameAndClosedLifecycle1787600000000 implements MigrationInterface {
  name = 'WorkItemStatusRenameAndClosedLifecycle1787600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "work_items" ADD "resolved_at" TIMESTAMP`);

    await queryRunner.query(`UPDATE "work_items" SET "status" = 'todo' WHERE "status" = 'backlog'`);

    await queryRunner.query(`UPDATE "work_items" SET "status" = 'closed' WHERE "status" = 'done'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "work_items" SET "status" = 'done' WHERE "status" IN ('resolved', 'closed')`,
    );

    // Lossy: `backlog` vs `todo` can no longer be told apart post-collapse,
    // same "no row data" caveat as this codebase's other rollbacks.

    await queryRunner.query(`ALTER TABLE "work_items" DROP COLUMN "resolved_at"`);
  }
}
