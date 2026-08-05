import { MigrationInterface, QueryRunner } from 'typeorm';

/** Sprints, dependencies, estimates and project risk register. */
export class InternalWorkPlanning1785888200000 implements MigrationInterface {
  name = 'InternalWorkPlanning1785888200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "work_sprints" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid, "name" character varying(120) NOT NULL, "goal" text, "status" character varying NOT NULL DEFAULT 'planned', "start_date" date, "end_date" date, "created_at" TIMESTAMP NOT NULL, "updated_at" TIMESTAMP NOT NULL, CONSTRAINT "PK_work_sprints" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_work_sprints_project" ON "work_sprints" ("project_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_work_sprints_status" ON "work_sprints" ("status")`);
    await queryRunner.query(`ALTER TABLE "work_sprints" ADD CONSTRAINT "FK_work_sprints_project" FOREIGN KEY ("project_id") REFERENCES "roadmap_initiatives"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

    await queryRunner.query(`ALTER TABLE "work_items" ADD "sprint_id" uuid`);
    await queryRunner.query(`ALTER TABLE "work_items" ADD "estimate_points" integer NOT NULL DEFAULT '0'`);
    await queryRunner.query(`CREATE INDEX "IDX_work_items_sprint" ON "work_items" ("sprint_id")`);
    await queryRunner.query(`ALTER TABLE "work_items" ADD CONSTRAINT "FK_work_items_sprint" FOREIGN KEY ("sprint_id") REFERENCES "work_sprints"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

    await queryRunner.query(`CREATE TABLE "work_item_dependencies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "work_item_id" integer NOT NULL, "depends_on_id" integer NOT NULL, "created_at" TIMESTAMP NOT NULL, CONSTRAINT "UQ_work_item_dependency" UNIQUE ("work_item_id", "depends_on_id"), CONSTRAINT "PK_work_item_dependencies" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_work_dependencies_item" ON "work_item_dependencies" ("work_item_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_work_dependencies_target" ON "work_item_dependencies" ("depends_on_id")`);
    await queryRunner.query(`ALTER TABLE "work_item_dependencies" ADD CONSTRAINT "FK_work_dependencies_item" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "work_item_dependencies" ADD CONSTRAINT "FK_work_dependencies_target" FOREIGN KEY ("depends_on_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

    await queryRunner.query(`CREATE TABLE "project_risks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "title" character varying(200) NOT NULL, "description" text, "level" character varying NOT NULL DEFAULT 'medium', "status" character varying NOT NULL DEFAULT 'open', "owner" character varying(160), "mitigation" text, "created_at" TIMESTAMP NOT NULL, "updated_at" TIMESTAMP NOT NULL, CONSTRAINT "PK_project_risks" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_project_risks_project" ON "project_risks" ("project_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_project_risks_status" ON "project_risks" ("status")`);
    await queryRunner.query(`ALTER TABLE "project_risks" ADD CONSTRAINT "FK_project_risks_project" FOREIGN KEY ("project_id") REFERENCES "roadmap_initiatives"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "project_risks" DROP CONSTRAINT "FK_project_risks_project"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_project_risks_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_project_risks_project"`);
    await queryRunner.query(`DROP TABLE "project_risks"`);
    await queryRunner.query(`ALTER TABLE "work_item_dependencies" DROP CONSTRAINT "FK_work_dependencies_target"`);
    await queryRunner.query(`ALTER TABLE "work_item_dependencies" DROP CONSTRAINT "FK_work_dependencies_item"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_work_dependencies_target"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_work_dependencies_item"`);
    await queryRunner.query(`DROP TABLE "work_item_dependencies"`);
    await queryRunner.query(`ALTER TABLE "work_items" DROP CONSTRAINT "FK_work_items_sprint"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_work_items_sprint"`);
    await queryRunner.query(`ALTER TABLE "work_items" DROP COLUMN "estimate_points"`);
    await queryRunner.query(`ALTER TABLE "work_items" DROP COLUMN "sprint_id"`);
    await queryRunner.query(`ALTER TABLE "work_sprints" DROP CONSTRAINT "FK_work_sprints_project"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_work_sprints_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_work_sprints_project"`);
    await queryRunner.query(`DROP TABLE "work_sprints"`);
  }
}
