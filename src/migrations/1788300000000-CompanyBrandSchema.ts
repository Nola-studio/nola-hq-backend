import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Introduces the legal-entity -> business-unit -> product hierarchy and
 * links `roadmap_initiatives`/`tickets` to a business unit. Seeds the one
 * legal entity, its three business units, and the five known products
 * (resolved by `code`, never a hardcoded id — see backfill below).
 *
 * `roadmap_initiatives.app_id` is left in place — the app-picker feature in
 * nola-hq still reads/writes it, and `appId` is still a live field on
 * `RoadmapInitiative`/its DTOs/`business.service.ts`. Dropping it is a
 * separate, later migration once the frontend no longer needs it.
 *
 * Postgres-only, like every other migration in this repo: SQLite dev keeps
 * `synchronize: true` and never runs migrations (see src/data-source.ts).
 */
export class CompanyBrandSchema1788300000000 implements MigrationInterface {
  name = 'CompanyBrandSchema1788300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "legal_entities" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"code" character varying(40) NOT NULL, ` +
        `"name" character varying(160) NOT NULL, ` +
        `"jurisdiction" character varying(40) NOT NULL, ` +
        `"tax_regime" character varying(40), ` +
        `"registration_number" character varying(64), ` +
        `"created_at" TIMESTAMP NOT NULL, ` +
        `"updated_at" TIMESTAMP NOT NULL, ` +
        `CONSTRAINT "UQ_legal_entities_code" UNIQUE ("code"), ` +
        `CONSTRAINT "PK_legal_entities" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TABLE "business_units" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"code" character varying(40) NOT NULL, ` +
        `"name" character varying(160) NOT NULL, ` +
        `"legal_entity_id" uuid NOT NULL, ` +
        `"is_active" boolean NOT NULL DEFAULT true, ` +
        `"created_at" TIMESTAMP NOT NULL, ` +
        `"updated_at" TIMESTAMP NOT NULL, ` +
        `CONSTRAINT "UQ_business_units_code" UNIQUE ("code"), ` +
        `CONSTRAINT "PK_business_units" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_business_units_legal_entity" ON "business_units" ("legal_entity_id")`);
    await queryRunner.query(
      `ALTER TABLE "business_units" ADD CONSTRAINT "FK_business_units_legal_entity" ` +
        `FOREIGN KEY ("legal_entity_id") REFERENCES "legal_entities"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "products" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"code" character varying(40) NOT NULL, ` +
        `"name" character varying(160) NOT NULL, ` +
        `"business_unit_id" uuid NOT NULL, ` +
        `"is_internal" boolean NOT NULL DEFAULT false, ` +
        `"source_aliases" text NOT NULL DEFAULT '[]', ` +
        `"created_at" TIMESTAMP NOT NULL, ` +
        `"updated_at" TIMESTAMP NOT NULL, ` +
        `CONSTRAINT "UQ_products_code" UNIQUE ("code"), ` +
        `CONSTRAINT "PK_products" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_products_business_unit" ON "products" ("business_unit_id")`);
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_products_business_unit" ` +
        `FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    // Seeds — legal_entities
    await queryRunner.query(
      `INSERT INTO "legal_entities" ("code", "name", "jurisdiction", "tax_regime", "registration_number", "created_at", "updated_at") ` +
        `VALUES ('nolaa-studio', 'Nolaa Studio Inc.', 'QC-CA', NULL, NULL, now(), now())`,
    );

    // Seeds — business_units (legal_entity_id resolved by code, never hardcoded)
    await queryRunner.query(
      `INSERT INTO "business_units" ("code", "name", "legal_entity_id", "created_at", "updated_at") VALUES ` +
        `('khi-lab', 'Khi-Lab', (SELECT "id" FROM "legal_entities" WHERE "code" = 'nolaa-studio'), now(), now()), ` +
        `('vantelis-it', 'Vantelis IT', (SELECT "id" FROM "legal_entities" WHERE "code" = 'nolaa-studio'), now(), now()), ` +
        `('nolaa-corp', 'Nolaa Studio', (SELECT "id" FROM "legal_entities" WHERE "code" = 'nolaa-studio'), now(), now())`,
    );

    // Seeds — products (business_unit_id resolved by code, never hardcoded)
    await queryRunner.query(
      `INSERT INTO "products" ("code", "name", "business_unit_id", "is_internal", "source_aliases", "created_at", "updated_at") VALUES ` +
        `('yekoli', 'Yekoli', (SELECT "id" FROM "business_units" WHERE "code" = 'khi-lab'), false, '["kelasi-owner-app","kelasi-web"]', now(), now()), ` +
        `('k-river', 'K-River', (SELECT "id" FROM "business_units" WHERE "code" = 'khi-lab'), false, '[]', now(), now()), ` +
        `('mycvmatcher', 'MyCVMatcher', (SELECT "id" FROM "business_units" WHERE "code" = 'khi-lab'), false, '[]', now(), now()), ` +
        `('butterfly', 'Butterfly', (SELECT "id" FROM "business_units" WHERE "code" = 'khi-lab'), false, '[]', now(), now()), ` +
        `('nolaa-hq', 'Nolaa HQ', (SELECT "id" FROM "business_units" WHERE "code" = 'khi-lab'), true, '[]', now(), now())`,
    );

    // roadmap_initiatives: add nullable, backfill by code, then enforce NOT NULL
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" ADD "business_unit_id" uuid`);
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" ADD "is_internal" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(
      `UPDATE "roadmap_initiatives" SET "business_unit_id" = (SELECT "id" FROM "business_units" WHERE "code" = 'khi-lab')`,
    );
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" ALTER COLUMN "business_unit_id" SET NOT NULL`);
    await queryRunner.query(
      `CREATE INDEX "IDX_roadmap_initiatives_business_unit" ON "roadmap_initiatives" ("business_unit_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "roadmap_initiatives" ADD CONSTRAINT "FK_roadmap_initiatives_business_unit" ` +
        `FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    // tickets: add nullable, backfill by code, then enforce NOT NULL
    await queryRunner.query(`ALTER TABLE "tickets" ADD "business_unit_id" uuid`);
    await queryRunner.query(
      `UPDATE "tickets" SET "business_unit_id" = (SELECT "id" FROM "business_units" WHERE "code" = 'khi-lab')`,
    );
    await queryRunner.query(`ALTER TABLE "tickets" ALTER COLUMN "business_unit_id" SET NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_tickets_business_unit" ON "tickets" ("business_unit_id")`);
    await queryRunner.query(
      `ALTER TABLE "tickets" ADD CONSTRAINT "FK_tickets_business_unit" ` +
        `FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tickets" DROP CONSTRAINT "FK_tickets_business_unit"`);
    await queryRunner.query(`DROP INDEX "IDX_tickets_business_unit"`);
    await queryRunner.query(`ALTER TABLE "tickets" DROP COLUMN "business_unit_id"`);

    await queryRunner.query(
      `ALTER TABLE "roadmap_initiatives" DROP CONSTRAINT "FK_roadmap_initiatives_business_unit"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_roadmap_initiatives_business_unit"`);
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" DROP COLUMN "business_unit_id"`);
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" DROP COLUMN "is_internal"`);

    await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "FK_products_business_unit"`);
    await queryRunner.query(`DROP INDEX "IDX_products_business_unit"`);
    await queryRunner.query(`DROP TABLE "products"`);

    await queryRunner.query(`ALTER TABLE "business_units" DROP CONSTRAINT "FK_business_units_legal_entity"`);
    await queryRunner.query(`DROP INDEX "IDX_business_units_legal_entity"`);
    await queryRunner.query(`DROP TABLE "business_units"`);

    await queryRunner.query(`DROP TABLE "legal_entities"`);
  }
}
