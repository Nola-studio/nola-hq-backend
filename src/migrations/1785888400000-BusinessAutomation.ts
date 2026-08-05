import { MigrationInterface, QueryRunner } from 'typeorm';

/** Quotes, linked documents, automatic reminders and project time tracking. */
export class BusinessAutomation1785888400000 implements MigrationInterface {
  name = 'BusinessAutomation1785888400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "business_quotes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "number" character varying(64) NOT NULL, "client_id" uuid NOT NULL, "project_id" uuid, "opportunity_id" uuid, "title" character varying(200) NOT NULL, "status" character varying(24) NOT NULL DEFAULT 'draft', "issued_on" date NOT NULL, "valid_until" date NOT NULL, "tax_rate" integer NOT NULL DEFAULT '0', "subtotal_cdf" bigint NOT NULL DEFAULT '0', "tax_cdf" bigint NOT NULL DEFAULT '0', "total_cdf" bigint NOT NULL DEFAULT '0', "payment_terms" text, "notes" text, "created_at" TIMESTAMP NOT NULL, "updated_at" TIMESTAMP NOT NULL, CONSTRAINT "UQ_business_quotes_number" UNIQUE ("number"), CONSTRAINT "PK_business_quotes" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_business_quotes_client" ON "business_quotes" ("client_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_business_quotes_project" ON "business_quotes" ("project_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_business_quotes_opportunity" ON "business_quotes" ("opportunity_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_business_quotes_status" ON "business_quotes" ("status")`);
    await queryRunner.query(`ALTER TABLE "business_quotes" ADD CONSTRAINT "FK_business_quotes_client" FOREIGN KEY ("client_id") REFERENCES "business_clients"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "business_quotes" ADD CONSTRAINT "FK_business_quotes_project" FOREIGN KEY ("project_id") REFERENCES "roadmap_initiatives"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "business_quotes" ADD CONSTRAINT "FK_business_quotes_opportunity" FOREIGN KEY ("opportunity_id") REFERENCES "business_opportunities"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

    await queryRunner.query(`CREATE TABLE "business_quote_lines" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "quote_id" uuid NOT NULL, "description" character varying(240) NOT NULL, "quantity" numeric(10,2) NOT NULL, "unit_price_cdf" bigint NOT NULL, "total_cdf" bigint NOT NULL, "position" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_business_quote_lines" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_business_quote_lines_quote" ON "business_quote_lines" ("quote_id")`);
    await queryRunner.query(`ALTER TABLE "business_quote_lines" ADD CONSTRAINT "FK_business_quote_lines_quote" FOREIGN KEY ("quote_id") REFERENCES "business_quotes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

    await queryRunner.query(`CREATE TABLE "business_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "entity_type" character varying(24) NOT NULL, "entity_id" uuid NOT NULL, "name" character varying(200) NOT NULL, "url" character varying(500) NOT NULL, "mime_type" character varying(120), "kind" character varying(80) NOT NULL DEFAULT 'other', "added_by" character varying(160), "created_at" TIMESTAMP NOT NULL, CONSTRAINT "PK_business_documents" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_business_documents_target" ON "business_documents" ("entity_type", "entity_id")`);

    await queryRunner.query(`CREATE TABLE "business_reminders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "fingerprint" character varying(180), "entity_type" character varying(24) NOT NULL, "entity_id" uuid NOT NULL, "title" character varying(220) NOT NULL, "due_at" TIMESTAMP NOT NULL, "assignee" character varying(160), "status" character varying(24) NOT NULL DEFAULT 'pending', "automatic" boolean NOT NULL DEFAULT false, "note" text, "created_at" TIMESTAMP NOT NULL, "updated_at" TIMESTAMP NOT NULL, CONSTRAINT "UQ_business_reminders_fingerprint" UNIQUE ("fingerprint"), CONSTRAINT "PK_business_reminders" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_business_reminders_entity" ON "business_reminders" ("entity_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_business_reminders_due" ON "business_reminders" ("due_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_business_reminders_status" ON "business_reminders" ("status")`);

    await queryRunner.query(`CREATE TABLE "project_time_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "work_item_id" integer, "member" character varying(160) NOT NULL, "work_date" date NOT NULL, "minutes" integer NOT NULL, "billable" boolean NOT NULL DEFAULT true, "hourly_rate_cdf" bigint NOT NULL DEFAULT '0', "description" text, "created_at" TIMESTAMP NOT NULL, "updated_at" TIMESTAMP NOT NULL, CONSTRAINT "PK_project_time_entries" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_project_time_entries_project" ON "project_time_entries" ("project_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_project_time_entries_ticket" ON "project_time_entries" ("work_item_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_project_time_entries_member" ON "project_time_entries" ("member")`);
    await queryRunner.query(`CREATE INDEX "IDX_project_time_entries_date" ON "project_time_entries" ("work_date")`);
    await queryRunner.query(`ALTER TABLE "project_time_entries" ADD CONSTRAINT "FK_project_time_entries_project" FOREIGN KEY ("project_id") REFERENCES "roadmap_initiatives"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "project_time_entries" ADD CONSTRAINT "FK_project_time_entries_ticket" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "project_time_entries" DROP CONSTRAINT "FK_project_time_entries_ticket"`);
    await queryRunner.query(`ALTER TABLE "project_time_entries" DROP CONSTRAINT "FK_project_time_entries_project"`);
    await queryRunner.query(`DROP TABLE "project_time_entries"`);
    await queryRunner.query(`DROP TABLE "business_reminders"`);
    await queryRunner.query(`DROP TABLE "business_documents"`);
    await queryRunner.query(`ALTER TABLE "business_quote_lines" DROP CONSTRAINT "FK_business_quote_lines_quote"`);
    await queryRunner.query(`DROP TABLE "business_quote_lines"`);
    await queryRunner.query(`ALTER TABLE "business_quotes" DROP CONSTRAINT "FK_business_quotes_opportunity"`);
    await queryRunner.query(`ALTER TABLE "business_quotes" DROP CONSTRAINT "FK_business_quotes_project"`);
    await queryRunner.query(`ALTER TABLE "business_quotes" DROP CONSTRAINT "FK_business_quotes_client"`);
    await queryRunner.query(`DROP TABLE "business_quotes"`);
  }
}
