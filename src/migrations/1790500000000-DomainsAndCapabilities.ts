import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lot 1.0 — the twelve functional domains of the referential (§4A) and their
 * 39 capabilities, plus a nullable `domain_id` / `capability_id` on the seven
 * tables that already hold canonical objects.
 *
 * Nullable on purpose: NOT NULL would mean classifying every existing row
 * before anything could ship. Classification happens domain by domain
 * afterwards, and `ON DELETE SET NULL` keeps a domain from ever blocking or
 * cascading into operational data.
 *
 * The seed is written out literally rather than imported from
 * `domains.constants.ts`: a migration is history and must keep applying the
 * same way after that file is edited.
 *
 * For anyone grepping "domain": `domains` here is the *functional* domain.
 * Internet domain names live in `studio_domains` — different concept, same
 * French word, deliberately different table names.
 */
export class DomainsAndCapabilities1790500000000 implements MigrationInterface {
  name = 'DomainsAndCapabilities1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "domains" (` +
        `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
        `"code" character varying(8) NOT NULL, ` +
        `"name" character varying(160) NOT NULL, ` +
        `"purpose" text, ` +
        `"owner" character varying(160), ` +
        `"position" integer NOT NULL DEFAULT 0, ` +
        `"created_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `"updated_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_domains" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "UQ_domains_code" UNIQUE ("code"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_domains_position" ON "domains" ("position")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "capabilities" (` +
        `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
        `"code" character varying(16) NOT NULL, ` +
        `"domain_id" uuid NOT NULL, ` +
        `"name" character varying(160) NOT NULL, ` +
        `"owner" character varying(160), ` +
        `"position" integer NOT NULL DEFAULT 0, ` +
        `"created_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `"updated_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_capabilities" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "UQ_capabilities_code" UNIQUE ("code"), ` +
        `CONSTRAINT "FK_capabilities_domain" FOREIGN KEY ("domain_id") ` +
        `REFERENCES "domains"("id") ON DELETE CASCADE)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_capabilities_domain_id" ON "capabilities" ("domain_id")`,
    );

    // `ON CONFLICT DO NOTHING`: re-running on a seeded database is a no-op
    // rather than a duplicate-key error.
    await queryRunner.query(
      `INSERT INTO "domains" ("id", "code", "name", "purpose", "position", "created_at", "updated_at") VALUES
      (gen_random_uuid(), 'D01', 'Groupe et gouvernance', 'L''existence institutionnelle de NolaaStudio : sociétés, filiales, participations, organes de décision, détenteurs, mandats et règles d''autorité.', 10, now(), now()),
      (gen_random_uuid(), 'D02', 'Organisations, départements et équipes', 'Comment le travail humain est organisé dans chaque entité : organisation, département, équipe, poste et rattachement.', 20, now(), now()),
      (gen_random_uuid(), 'D03', 'Personnes, ressources humaines et accès', 'La relation entre NolaaStudio et les personnes qui y travaillent, et leur capacité à accéder aux ressources. Nola Auth reste la source d''identité.', 30, now(), now()),
      (gen_random_uuid(), 'D04', 'Marques, produits et propriété intellectuelle', 'Le portefeuille de produits, marques et actifs intellectuels, traités comme des objets de gouvernance et non comme de simples repositories.', 40, now(), now()),
      (gen_random_uuid(), 'D05', 'Stratégie, objectifs et décisions', 'La transformation de la vision en objectifs mesurables, puis le lien entre ces objectifs et le travail réellement exécuté.', 50, now(), now()),
      (gen_random_uuid(), 'D06', 'Projets, ingénierie et qualité', 'Le moteur d''exécution : transformer les besoins et référentiels en travail planifié, puis le relier au code, aux tests, aux releases et aux déploiements.', 60, now(), now()),
      (gen_random_uuid(), 'D07', 'Clients, commercial et cycle de vente', 'La relation économique avec les organisations clientes, de la qualification au contrat, au projet, à la facturation et au renouvellement.', 70, now(), now()),
      (gen_random_uuid(), 'D08', 'Finance et modèle mère-filles', 'La vérité financière de gestion : contribution par produit, entité, client, projet et pays, et flux internes entre la mère et ses filiales.', 80, now(), now()),
      (gen_random_uuid(), 'D09', 'Support, exploitation et gestion de services', 'L''exploitation quotidienne des services après mise à disposition : demandes, incidents, problèmes, changements, SLA, disponibilité et continuité.', 90, now(), now()),
      (gen_random_uuid(), 'D10', 'Marketing, marques et croissance', 'La manière dont NolaaStudio et ses produits sont présentés au marché, acquièrent de l''audience et la transforment en opportunités et revenus.', 100, now(), now()),
      (gen_random_uuid(), 'D11', 'Juridique, risques et conformité', 'La protection du groupe : contrats, obligations, risques, contrôles et exigences de protection des données applicables aux entités et produits.', 110, now(), now()),
      (gen_random_uuid(), 'D12', 'Documentation, savoir et architecture d''entreprise', 'La mémoire institutionnelle : ce que le groupe sait, pourquoi les décisions ont été prises, comment ses processus fonctionnent et comment ses systèmes sont construits.', 120, now(), now())
       ON CONFLICT ("code") DO NOTHING`,
    );

    await queryRunner.query(
      `INSERT INTO "capabilities" ("id", "code", "domain_id", "name", "position", "created_at", "updated_at")
       SELECT gen_random_uuid(), s.code, d.id, s.name, s.position, now(), now()
       FROM (VALUES
         ('D01.C01', 'D01', 'Registre corporatif', 10),
         ('D01.C02', 'D01', 'Décisions et délégations', 20),
         ('D02.C01', 'D02', 'Structure organisationnelle', 10),
         ('D02.C02', 'D02', 'Postes et responsabilités', 20),
         ('D03.C01', 'D03', 'Dossier collaborateur', 10),
         ('D03.C02', 'D03', 'Compétences et capacité', 20),
         ('D03.C03', 'D03', 'Accès', 30),
         ('D04.C01', 'D04', 'Registre produit', 10),
         ('D04.C02', 'D04', 'Lifecycle et portefeuille', 20),
         ('D04.C03', 'D04', 'Propriété intellectuelle', 30),
         ('D05.C01', 'D05', 'Planification stratégique', 10),
         ('D05.C02', 'D05', 'Exécution stratégique', 20),
         ('D06.C01', 'D06', 'Modèle de travail unifié', 10),
         ('D06.C02', 'D06', 'Planification et exécution', 20),
         ('D06.C03', 'D06', 'GitHub et livraison', 30),
         ('D06.C04', 'D06', 'Qualité', 40),
         ('D06.C05', 'D06', 'Development Workspace et exécution liée au code', 50),
         ('D06.C06', 'D06', 'Contribution et reconnaissance de l''exécution', 60),
         ('D07.C01', 'D07', 'Organisation cliente canonique', 10),
         ('D07.C02', 'D07', 'Audit numérique', 20),
         ('D07.C03', 'D07', 'Vente et contrats', 30),
         ('D08.C01', 'D08', 'Référentiel financier', 10),
         ('D08.C02', 'D08', 'Performance', 20),
         ('D08.C03', 'D08', 'Flux mère-filles', 30),
         ('D08.C04', 'D08', 'Contrôles', 40),
         ('D09.C01', 'D09', 'Catalogue de services', 10),
         ('D09.C02', 'D09', 'ITSM', 20),
         ('D09.C03', 'D09', 'Fiabilité', 30),
         ('D10.C01', 'D10', 'Planification marketing', 10),
         ('D10.C02', 'D10', 'Assets et marques', 20),
         ('D10.C03', 'D10', 'Croissance', 30),
         ('D11.C01', 'D11', 'Contrats juridiques', 10),
         ('D11.C02', 'D11', 'Risques', 20),
         ('D11.C03', 'D11', 'Protection des données', 30),
         ('D11.C04', 'D11', 'Obligations', 40),
         ('D12.C01', 'D12', 'Gestion documentaire', 10),
         ('D12.C02', 'D12', 'Processus et procédures', 20),
         ('D12.C03', 'D12', 'Architecture d''entreprise', 30),
         ('D12.C04', 'D12', 'Référentiels d''exécution et ingestion structurée', 40)
       ) AS s(code, domain_code, name, position)
       JOIN "domains" d ON d."code" = s.domain_code
       ON CONFLICT ("code") DO NOTHING`,
    );

    await queryRunner.query(
      `ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "domain_id" uuid NULL REFERENCES "domains"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "capability_id" uuid NULL REFERENCES "capabilities"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_work_items_domain_id" ON "work_items" ("domain_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "roadmap_initiatives" ADD COLUMN IF NOT EXISTS "domain_id" uuid NULL REFERENCES "domains"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "roadmap_initiatives" ADD COLUMN IF NOT EXISTS "capability_id" uuid NULL REFERENCES "capabilities"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_roadmap_initiatives_domain_id" ON "roadmap_initiatives" ("domain_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "roadmap_objectives" ADD COLUMN IF NOT EXISTS "domain_id" uuid NULL REFERENCES "domains"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "roadmap_objectives" ADD COLUMN IF NOT EXISTS "capability_id" uuid NULL REFERENCES "capabilities"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_roadmap_objectives_domain_id" ON "roadmap_objectives" ("domain_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "domain_id" uuid NULL REFERENCES "domains"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "capability_id" uuid NULL REFERENCES "capabilities"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_products_domain_id" ON "products" ("domain_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "domain_id" uuid NULL REFERENCES "domains"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "capability_id" uuid NULL REFERENCES "capabilities"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tickets_domain_id" ON "tickets" ("domain_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_risks" ADD COLUMN IF NOT EXISTS "domain_id" uuid NULL REFERENCES "domains"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_risks" ADD COLUMN IF NOT EXISTS "capability_id" uuid NULL REFERENCES "capabilities"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_project_risks_domain_id" ON "project_risks" ("domain_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "business_contracts" ADD COLUMN IF NOT EXISTS "domain_id" uuid NULL REFERENCES "domains"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "business_contracts" ADD COLUMN IF NOT EXISTS "capability_id" uuid NULL REFERENCES "capabilities"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_business_contracts_domain_id" ON "business_contracts" ("domain_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_work_items_domain_id"`);
    await queryRunner.query(`ALTER TABLE "work_items" DROP COLUMN IF EXISTS "capability_id"`);
    await queryRunner.query(`ALTER TABLE "work_items" DROP COLUMN IF EXISTS "domain_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_roadmap_initiatives_domain_id"`);
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" DROP COLUMN IF EXISTS "capability_id"`);
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" DROP COLUMN IF EXISTS "domain_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_roadmap_objectives_domain_id"`);
    await queryRunner.query(`ALTER TABLE "roadmap_objectives" DROP COLUMN IF EXISTS "capability_id"`);
    await queryRunner.query(`ALTER TABLE "roadmap_objectives" DROP COLUMN IF EXISTS "domain_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_domain_id"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "capability_id"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "domain_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tickets_domain_id"`);
    await queryRunner.query(`ALTER TABLE "tickets" DROP COLUMN IF EXISTS "capability_id"`);
    await queryRunner.query(`ALTER TABLE "tickets" DROP COLUMN IF EXISTS "domain_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_project_risks_domain_id"`);
    await queryRunner.query(`ALTER TABLE "project_risks" DROP COLUMN IF EXISTS "capability_id"`);
    await queryRunner.query(`ALTER TABLE "project_risks" DROP COLUMN IF EXISTS "domain_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_business_contracts_domain_id"`);
    await queryRunner.query(`ALTER TABLE "business_contracts" DROP COLUMN IF EXISTS "capability_id"`);
    await queryRunner.query(`ALTER TABLE "business_contracts" DROP COLUMN IF EXISTS "domain_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "capabilities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "domains"`);
  }
}
