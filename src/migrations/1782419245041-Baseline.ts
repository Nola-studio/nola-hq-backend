import { MigrationInterface, QueryRunner } from "typeorm";

export class Baseline1782419245041 implements MigrationInterface {
    name = 'Baseline1782419245041'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "activity_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "t" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL, "actor" character varying NOT NULL, "cat" character varying NOT NULL, "text" text NOT NULL, "ref" character varying, CONSTRAINT "PK_f8e8d9dbf64f93f58ae52b4a9e4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_251b3c80e18f768e809a8038d6" ON "activity_events" ("created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_84dcb5e419eef8831f21e7f379" ON "activity_events" ("cat") `);
        await queryRunner.query(`CREATE TABLE "audit_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ts" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL, "actor" character varying NOT NULL, "action" character varying NOT NULL, "target" character varying NOT NULL, "ip" character varying NOT NULL, "meta" character varying NOT NULL, CONSTRAINT "PK_6b1623bcad4d04530b76548d619" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_4c3d1f55e641883d183f032d4b" ON "audit_entries" ("ts") `);
        await queryRunner.query(`CREATE INDEX "IDX_7064857330342779b2bbd4584c" ON "audit_entries" ("action") `);
        await queryRunner.query(`CREATE TABLE "broadcasts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "channel" character varying NOT NULL, "subject" character varying NOT NULL, "body" text NOT NULL, "recipients" text NOT NULL DEFAULT '[]', "status" character varying NOT NULL, "author" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL, "scheduled_at" TIMESTAMP, "sent_at" TIMESTAMP, CONSTRAINT "PK_b0586900034d0726bbdcb1b21b2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_893a5118a92a289fa4ec08040c" ON "broadcasts" ("channel") `);
        await queryRunner.query(`CREATE INDEX "IDX_ccbe6cec45c80550380c5bd7e6" ON "broadcasts" ("status") `);
        await queryRunner.query(`CREATE TABLE "countries" ("id" character varying(2) NOT NULL, "name" character varying NOT NULL, "flag" character varying NOT NULL, "cities" text NOT NULL, CONSTRAINT "PK_b2d7006793e8697ab3ae2deff18" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "deploys" ("id" character varying NOT NULL, "app" character varying NOT NULL, "version" character varying NOT NULL, "env" character varying NOT NULL, "author" character varying NOT NULL, "t" character varying NOT NULL, "status" character varying NOT NULL, "sha" character varying NOT NULL, "changelog" text NOT NULL, CONSTRAINT "PK_9154e031234b1a8b6cd91de6ab0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_6cc2598dbf5e8406363ad90f98" ON "deploys" ("app") `);
        await queryRunner.query(`CREATE TABLE "health_entries" ("id" character varying NOT NULL, "name" character varying NOT NULL, "uptime" real NOT NULL, "p50" integer NOT NULL, "p99" integer NOT NULL, "errors_24h" integer NOT NULL, "status" character varying NOT NULL, "series" text NOT NULL, CONSTRAINT "PK_e200d3b1eddf4a0fe14fb558043" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "invoices" ("id" character varying NOT NULL, "tenant" character varying NOT NULL, "amt" integer NOT NULL, "due" character varying NOT NULL, "status" character varying NOT NULL, "method" character varying NOT NULL, "issued" character varying NOT NULL, CONSTRAINT "PK_668cef7c22a427fd822cc1be3ce" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_12dffc6a5a1777d88e67325ca9" ON "invoices" ("tenant") `);
        await queryRunner.query(`CREATE INDEX "IDX_ac0f09364e3701d9ed35435288" ON "invoices" ("status") `);
        await queryRunner.query(`CREATE TABLE "kpis" ("id" character varying NOT NULL, "label" character varying NOT NULL, "value" real NOT NULL, "unit" character varying NOT NULL, "delta" real NOT NULL, "series" text NOT NULL, "invert_color" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_96cc541107cdc102a50e2b0ac90" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "metric_snapshots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "metricKey" character varying NOT NULL, "date" character varying NOT NULL, "value" real NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e7df991ed7476a98b561fc45083" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b4fe0f8e18099aa93a6df6583b" ON "metric_snapshots" ("metricKey") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_87a8ae85ded2bca07430b7566e" ON "metric_snapshots" ("metricKey", "date") `);
        await queryRunner.query(`CREATE TABLE "logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ts" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL, "svc" character varying NOT NULL, "lvl" character varying NOT NULL, "msg" text NOT NULL, CONSTRAINT "PK_fb1b805f2f7795de79fa69340ba" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_1c711f832a26f92f2d3d79016b" ON "logs" ("ts") `);
        await queryRunner.query(`CREATE INDEX "IDX_0cea11b3443bee34697606c59c" ON "logs" ("created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_33a81649ef8351d3132f84ac5f" ON "logs" ("svc") `);
        await queryRunner.query(`CREATE INDEX "IDX_b165be83baa80bc0a03f10260b" ON "logs" ("lvl") `);
        await queryRunner.query(`CREATE TABLE "momo_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ts" character varying NOT NULL, "provider" character varying NOT NULL, "tenant" character varying, "amt" integer NOT NULL, "kind" character varying NOT NULL, "ref" character varying NOT NULL, CONSTRAINT "UQ_85aa17a5aff85c17699b8636951" UNIQUE ("ref"), CONSTRAINT "PK_83d48b6835f4ccb7b5324807e42" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_85cfb2532e70dc4e80a571c493" ON "momo_entries" ("provider") `);
        await queryRunner.query(`CREATE INDEX "IDX_7b2530e645e3b9d326eb04b5d1" ON "momo_entries" ("tenant") `);
        await queryRunner.query(`CREATE INDEX "IDX_017b42c715a3143822e4a873b7" ON "momo_entries" ("kind") `);
        await queryRunner.query(`CREATE TABLE "pipeline_items" ("id" character varying NOT NULL, "stage" character varying NOT NULL, "name" character varying NOT NULL, "country" character varying(2) NOT NULL, "amt" integer NOT NULL, "owner" character varying NOT NULL, "age" character varying NOT NULL, CONSTRAINT "PK_ff6d7617fdace73e68a11fa47af" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_40ced783db5c0140c93fc854f4" ON "pipeline_items" ("stage") `);
        await queryRunner.query(`CREATE TABLE "team_members" ("id" character varying NOT NULL, "name" character varying NOT NULL, "role" character varying NOT NULL, "tag" character varying NOT NULL, "avatar" character varying NOT NULL, "hue" integer NOT NULL, "online" boolean NOT NULL DEFAULT false, "email" character varying NOT NULL, "country" character varying(2) NOT NULL, "perms" text NOT NULL, "last" character varying NOT NULL, "password_hash" character varying, CONSTRAINT "UQ_a88b84bdd6391e3d877a59fbb70" UNIQUE ("email"), CONSTRAINT "PK_ca3eae89dcf20c9fd95bf7460aa" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "tenants" ("id" character varying NOT NULL, "name" character varying NOT NULL, "country" character varying(2) NOT NULL, "city" character varying NOT NULL, "apps" text NOT NULL, "plan" character varying NOT NULL, "mrr_cdf" integer NOT NULL DEFAULT '0', "status" character varying NOT NULL, "since" character varying NOT NULL, "users" integer NOT NULL DEFAULT '0', "owner" character varying NOT NULL, "whatsapp" character varying NOT NULL, "mobile_money" character varying NOT NULL, "ar_days" integer NOT NULL DEFAULT '0', "nps" integer, CONSTRAINT "PK_53be67a04681c66b87ee27c9321" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_6b7a2c683d91c05d2ef11fb684" ON "tenants" ("country") `);
        await queryRunner.query(`CREATE INDEX "IDX_2c7d8d15b7cc219692e1765a00" ON "tenants" ("plan") `);
        await queryRunner.query(`CREATE INDEX "IDX_c59559e7872bc9726adef4669f" ON "tenants" ("status") `);
        await queryRunner.query(`CREATE TABLE "tenant_crm" ("tenantId" character varying NOT NULL, "country" character varying(2), "city" character varying, "owner" character varying, "whatsapp" character varying, "mobile_money" character varying, "nps" integer, "notes" text, "kc_user_id" character varying, "kelasi_school_id" character varying, "owner_email" character varying, "mobile_money_phone" character varying, "provisioned_at" character varying, "provision_error" character varying(500), CONSTRAINT "PK_ea5f0d5aa6541af1f132803eea7" PRIMARY KEY ("tenantId"))`);
        await queryRunner.query(`CREATE TABLE "tickets" ("id" SERIAL NOT NULL, "tenant" character varying NOT NULL, "subject" character varying NOT NULL, "title" character varying NOT NULL, "body" text NOT NULL, "contact" character varying NOT NULL, "priority" character varying NOT NULL, "status" character varying NOT NULL, "assignee" character varying NOT NULL, "assigned" character varying NOT NULL, "sla" character varying NOT NULL, "age" character varying NOT NULL, "ago" character varying NOT NULL, "category" character varying, "source" character varying, "replies" text NOT NULL DEFAULT '[]', "created_at" TIMESTAMP NOT NULL, "updated_at" TIMESTAMP NOT NULL, CONSTRAINT "PK_343bc942ae261cf7a1377f48fd0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_bbd3e5aa00233a7d352577d6a6" ON "tickets" ("tenant") `);
        await queryRunner.query(`CREATE INDEX "IDX_1cfb61a749963bfba02395e118" ON "tickets" ("priority") `);
        await queryRunner.query(`CREATE INDEX "IDX_12b901b34113688b4786368510" ON "tickets" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_143c60f935aa86982b2074fadd" ON "tickets" ("category") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_143c60f935aa86982b2074fadd"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_12b901b34113688b4786368510"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1cfb61a749963bfba02395e118"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bbd3e5aa00233a7d352577d6a6"`);
        await queryRunner.query(`DROP TABLE "tickets"`);
        await queryRunner.query(`DROP TABLE "tenant_crm"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c59559e7872bc9726adef4669f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2c7d8d15b7cc219692e1765a00"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6b7a2c683d91c05d2ef11fb684"`);
        await queryRunner.query(`DROP TABLE "tenants"`);
        await queryRunner.query(`DROP TABLE "team_members"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_40ced783db5c0140c93fc854f4"`);
        await queryRunner.query(`DROP TABLE "pipeline_items"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_017b42c715a3143822e4a873b7"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7b2530e645e3b9d326eb04b5d1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_85cfb2532e70dc4e80a571c493"`);
        await queryRunner.query(`DROP TABLE "momo_entries"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b165be83baa80bc0a03f10260b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_33a81649ef8351d3132f84ac5f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0cea11b3443bee34697606c59c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1c711f832a26f92f2d3d79016b"`);
        await queryRunner.query(`DROP TABLE "logs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_87a8ae85ded2bca07430b7566e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b4fe0f8e18099aa93a6df6583b"`);
        await queryRunner.query(`DROP TABLE "metric_snapshots"`);
        await queryRunner.query(`DROP TABLE "kpis"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ac0f09364e3701d9ed35435288"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_12dffc6a5a1777d88e67325ca9"`);
        await queryRunner.query(`DROP TABLE "invoices"`);
        await queryRunner.query(`DROP TABLE "health_entries"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6cc2598dbf5e8406363ad90f98"`);
        await queryRunner.query(`DROP TABLE "deploys"`);
        await queryRunner.query(`DROP TABLE "countries"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ccbe6cec45c80550380c5bd7e6"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_893a5118a92a289fa4ec08040c"`);
        await queryRunner.query(`DROP TABLE "broadcasts"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7064857330342779b2bbd4584c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4c3d1f55e641883d183f032d4b"`);
        await queryRunner.query(`DROP TABLE "audit_entries"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_84dcb5e419eef8831f21e7f379"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_251b3c80e18f768e809a8038d6"`);
        await queryRunner.query(`DROP TABLE "activity_events"`);
    }

}
