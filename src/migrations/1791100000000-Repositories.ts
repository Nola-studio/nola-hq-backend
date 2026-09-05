import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Le registre des dépôts de code (ENG-06, lot 2.0).
 *
 * HQ ne réplique pas GitHub : le code, les commits et les pull requests y
 * restent canoniques. Cette table tient ce dont HQ a besoin pour piloter —
 * quel dépôt sert quel produit, qui en répond, et quels projets ont le droit
 * d'y ouvrir une branche.
 */
export class Repositories1791100000000 implements MigrationInterface {
  name = 'Repositories1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "repositories" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"provider" character varying(16) NOT NULL DEFAULT 'github', ` +
        `"owner" character varying(120) NOT NULL, ` +
        `"name" character varying(120) NOT NULL, ` +
        `"external_id" character varying(64), ` +
        `"default_branch" character varying(255) NOT NULL DEFAULT 'main', ` +
        `"visibility" character varying(16) NOT NULL DEFAULT 'private', ` +
        `"archived" boolean NOT NULL DEFAULT false, ` +
        `"html_url" character varying(400), ` +
        `"description" text, ` +
        `"product_id" uuid, ` +
        `"domain_id" uuid, ` +
        `"steward" character varying(160), ` +
        `"last_synced_at" TIMESTAMP, ` +
        `"created_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `"updated_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_repositories" PRIMARY KEY ("id"), ` +
        // Un même dépôt ne doit pas pouvoir être enregistré deux fois.
        `CONSTRAINT "UQ_repositories_provider_owner_name" UNIQUE ("provider", "owner", "name"))`,
    );

    // `SET NULL` des deux côtés : un dépôt survit à la suppression du produit
    // qu'il servait comme à celle de son classement fonctionnel. Ce sont des
    // rattachements, pas des propriétaires.
    await queryRunner.query(
      `ALTER TABLE "repositories" ADD CONSTRAINT "FK_repositories_product" ` +
        `FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "repositories" ADD CONSTRAINT "FK_repositories_domain" ` +
        `FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE SET NULL`,
    );

    await queryRunner.query(`CREATE INDEX "IDX_repositories_provider" ON "repositories" ("provider")`);
    await queryRunner.query(`CREATE INDEX "IDX_repositories_external_id" ON "repositories" ("external_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_repositories_product_id" ON "repositories" ("product_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_repositories_domain_id" ON "repositories" ("domain_id")`);

    /**
     * GitHub retrouve un dépôt sans distinguer la casse. La contrainte
     * d'unicité ci-dessus, elle, distingue : sans cet index, `Nola-studio/HQ`
     * et `nola-studio/hq` cohabiteraient comme deux dépôts alors qu'ils n'en
     * sont qu'un.
     */
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_repositories_ci" ON "repositories" ` +
        `("provider", LOWER("owner"), LOWER("name"))`,
    );

    await queryRunner.query(
      `CREATE TABLE "repository_projects" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"repository_id" uuid NOT NULL, ` +
        `"project_id" uuid NOT NULL, ` +
        `"created_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_repository_projects" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "UQ_repository_projects_pair" UNIQUE ("repository_id", "project_id"))`,
    );

    // `CASCADE` ici, contrairement aux rattachements ci-dessus : une
    // autorisation n'a pas de sens sans les deux objets qu'elle relie.
    await queryRunner.query(
      `ALTER TABLE "repository_projects" ADD CONSTRAINT "FK_repository_projects_repository" ` +
        `FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "repository_projects" ADD CONSTRAINT "FK_repository_projects_project" ` +
        `FOREIGN KEY ("project_id") REFERENCES "roadmap_initiatives"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_repository_projects_repository_id" ON "repository_projects" ("repository_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_repository_projects_project_id" ON "repository_projects" ("project_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "repository_projects"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "repositories"`);
  }
}
