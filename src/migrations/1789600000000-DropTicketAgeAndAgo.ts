import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropTicketAgeAndAgo1789600000000 implements MigrationInterface {
  name = 'DropTicketAgeAndAgo1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tickets" DROP COLUMN "age"`);
    await queryRunner.query(`ALTER TABLE "tickets" DROP COLUMN "ago"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tickets" ADD COLUMN "ago" character varying NOT NULL DEFAULT '0 min'`);
    await queryRunner.query(`ALTER TABLE "tickets" ADD COLUMN "age" character varying NOT NULL DEFAULT '0 min'`);
  }
}
