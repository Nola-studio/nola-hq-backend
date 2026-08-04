import { MigrationInterface, QueryRunner } from 'typeorm';

/** Internal studio CRM, commercial pipeline and project profitability. */
export class InternalBusinessManagement1785888300000 implements MigrationInterface {
  name = 'InternalBusinessManagement1785888300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "business_clients" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(180) NOT NULL, "status" character varying(24) NOT NULL DEFAULT 'prospect', "contact_name" character varying(160), "email" character varying(180), "phone" character varying(40), "country" character varying(2), "city" character varying(120), "owner" character varying(160), "notes" text, "created_at" TIMESTAMP NOT NULL, "updated_at" TIMESTAMP NOT NULL, CONSTRAINT "PK_business_clients" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_business_clients_name" ON "business_clients" ("name")`);
    await queryRunner.query(`CREATE INDEX "IDX_business_clients_status" ON "business_clients" ("status")`);

    await queryRunner.query(`CREATE TABLE "business_opportunities" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "client_id" uuid NOT NULL, "project_id" uuid, "title" character varying(200) NOT NULL, "stage" character varying(24) NOT NULL DEFAULT 'lead', "value_cdf" bigint NOT NULL DEFAULT '0', "probability" integer NOT NULL DEFAULT '10', "expected_close_date" date, "next_step" text, "loss_reason" text, "owner" character varying(160), "created_at" TIMESTAMP NOT NULL, "updated_at" TIMESTAMP NOT NULL, CONSTRAINT "PK_business_opportunities" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_business_opportunities_client" ON "business_opportunities" ("client_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_business_opportunities_project" ON "business_opportunities" ("project_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_business_opportunities_stage" ON "business_opportunities" ("stage")`);
    await queryRunner.query(`ALTER TABLE "business_opportunities" ADD CONSTRAINT "FK_business_opportunities_client" FOREIGN KEY ("client_id") REFERENCES "business_clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "business_opportunities" ADD CONSTRAINT "FK_business_opportunities_project" FOREIGN KEY ("project_id") REFERENCES "roadmap_initiatives"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

    await queryRunner.query(`CREATE TABLE "business_contracts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "number" character varying(64) NOT NULL, "client_id" uuid NOT NULL, "project_id" uuid, "opportunity_id" uuid, "title" character varying(200) NOT NULL, "status" character varying(24) NOT NULL DEFAULT 'draft', "value_cdf" bigint NOT NULL DEFAULT '0', "start_date" date, "end_date" date, "signed_at" TIMESTAMP, "payment_terms" character varying(200), "notes" text, "created_at" TIMESTAMP NOT NULL, "updated_at" TIMESTAMP NOT NULL, CONSTRAINT "UQ_business_contracts_number" UNIQUE ("number"), CONSTRAINT "PK_business_contracts" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_business_contracts_client" ON "business_contracts" ("client_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_business_contracts_project" ON "business_contracts" ("project_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_business_contracts_opportunity" ON "business_contracts" ("opportunity_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_business_contracts_status" ON "business_contracts" ("status")`);
    await queryRunner.query(`ALTER TABLE "business_contracts" ADD CONSTRAINT "FK_business_contracts_client" FOREIGN KEY ("client_id") REFERENCES "business_clients"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "business_contracts" ADD CONSTRAINT "FK_business_contracts_project" FOREIGN KEY ("project_id") REFERENCES "roadmap_initiatives"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "business_contracts" ADD CONSTRAINT "FK_business_contracts_opportunity" FOREIGN KEY ("opportunity_id") REFERENCES "business_opportunities"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

    await queryRunner.query(`CREATE TABLE "project_budgets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "revenue_budget_cdf" bigint NOT NULL DEFAULT '0', "expense_budget_cdf" bigint NOT NULL DEFAULT '0', "currency" character varying(3) NOT NULL DEFAULT 'CDF', "created_at" TIMESTAMP NOT NULL, "updated_at" TIMESTAMP NOT NULL, CONSTRAINT "UQ_project_budgets_project" UNIQUE ("project_id"), CONSTRAINT "PK_project_budgets" PRIMARY KEY ("id"))`);
    await queryRunner.query(`ALTER TABLE "project_budgets" ADD CONSTRAINT "FK_project_budgets_project" FOREIGN KEY ("project_id") REFERENCES "roadmap_initiatives"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

    await queryRunner.query(`CREATE TABLE "business_expenses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "contract_id" uuid, "label" character varying(160) NOT NULL, "category" character varying(80) NOT NULL DEFAULT 'other', "amount_cdf" bigint NOT NULL DEFAULT '0', "incurred_on" date NOT NULL, "vendor" character varying(160), "status" character varying(24) NOT NULL DEFAULT 'planned', "notes" text, "created_at" TIMESTAMP NOT NULL, "updated_at" TIMESTAMP NOT NULL, CONSTRAINT "PK_business_expenses" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_business_expenses_project" ON "business_expenses" ("project_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_business_expenses_contract" ON "business_expenses" ("contract_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_business_expenses_status" ON "business_expenses" ("status")`);
    await queryRunner.query(`ALTER TABLE "business_expenses" ADD CONSTRAINT "FK_business_expenses_project" FOREIGN KEY ("project_id") REFERENCES "roadmap_initiatives"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "business_expenses" ADD CONSTRAINT "FK_business_expenses_contract" FOREIGN KEY ("contract_id") REFERENCES "business_contracts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

    await queryRunner.query(`CREATE TABLE "business_invoices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "number" character varying(64) NOT NULL, "client_id" uuid NOT NULL, "project_id" uuid NOT NULL, "contract_id" uuid, "amount_cdf" bigint NOT NULL DEFAULT '0', "paid_amount_cdf" bigint NOT NULL DEFAULT '0', "issued_on" date NOT NULL, "due_on" date NOT NULL, "paid_at" TIMESTAMP, "status" character varying(24) NOT NULL DEFAULT 'draft', "description" text, "created_at" TIMESTAMP NOT NULL, "updated_at" TIMESTAMP NOT NULL, CONSTRAINT "UQ_business_invoices_number" UNIQUE ("number"), CONSTRAINT "PK_business_invoices" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_business_invoices_client" ON "business_invoices" ("client_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_business_invoices_project" ON "business_invoices" ("project_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_business_invoices_contract" ON "business_invoices" ("contract_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_business_invoices_status" ON "business_invoices" ("status")`);
    await queryRunner.query(`ALTER TABLE "business_invoices" ADD CONSTRAINT "FK_business_invoices_client" FOREIGN KEY ("client_id") REFERENCES "business_clients"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "business_invoices" ADD CONSTRAINT "FK_business_invoices_project" FOREIGN KEY ("project_id") REFERENCES "roadmap_initiatives"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "business_invoices" ADD CONSTRAINT "FK_business_invoices_contract" FOREIGN KEY ("contract_id") REFERENCES "business_contracts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "business_invoices" DROP CONSTRAINT "FK_business_invoices_contract"`);
    await queryRunner.query(`ALTER TABLE "business_invoices" DROP CONSTRAINT "FK_business_invoices_project"`);
    await queryRunner.query(`ALTER TABLE "business_invoices" DROP CONSTRAINT "FK_business_invoices_client"`);
    await queryRunner.query(`DROP TABLE "business_invoices"`);
    await queryRunner.query(`ALTER TABLE "business_expenses" DROP CONSTRAINT "FK_business_expenses_contract"`);
    await queryRunner.query(`ALTER TABLE "business_expenses" DROP CONSTRAINT "FK_business_expenses_project"`);
    await queryRunner.query(`DROP TABLE "business_expenses"`);
    await queryRunner.query(`ALTER TABLE "project_budgets" DROP CONSTRAINT "FK_project_budgets_project"`);
    await queryRunner.query(`DROP TABLE "project_budgets"`);
    await queryRunner.query(`ALTER TABLE "business_contracts" DROP CONSTRAINT "FK_business_contracts_opportunity"`);
    await queryRunner.query(`ALTER TABLE "business_contracts" DROP CONSTRAINT "FK_business_contracts_project"`);
    await queryRunner.query(`ALTER TABLE "business_contracts" DROP CONSTRAINT "FK_business_contracts_client"`);
    await queryRunner.query(`DROP TABLE "business_contracts"`);
    await queryRunner.query(`ALTER TABLE "business_opportunities" DROP CONSTRAINT "FK_business_opportunities_project"`);
    await queryRunner.query(`ALTER TABLE "business_opportunities" DROP CONSTRAINT "FK_business_opportunities_client"`);
    await queryRunner.query(`DROP TABLE "business_opportunities"`);
    await queryRunner.query(`DROP TABLE "business_clients"`);
  }
}
