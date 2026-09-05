import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameKelasiSchoolIdToYekoliSchoolId1788900000000
  implements MigrationInterface
{
  name = 'RenameKelasiSchoolIdToYekoliSchoolId1788900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_crm" RENAME COLUMN "kelasi_school_id" TO "yekoli_school_id"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_crm" RENAME COLUMN "yekoli_school_id" TO "kelasi_school_id"`,
    );
  }
}
