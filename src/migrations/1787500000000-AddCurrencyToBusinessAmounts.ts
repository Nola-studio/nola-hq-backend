import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets every Business-module amount carry its own currency (USD, CDF, or
 * CAD — no exchange rate anywhere, amounts are never converted). Additive
 * only: existing `*_cdf` columns keep their name (large blast radius to
 * rename them across entities/DTOs/frontend for a cosmetic gain), each
 * just gains a sibling `*_currency` column defaulting to 'CDF' — true for
 * every historical row, which really was CDF-only before this change.
 *
 * `business_invoices`/`business_quotes` get a single `currency` column
 * (not `amount_currency`/`total_currency`): an invoice's `amount_cdf` and
 * `paid_amount_cdf` are the same money in two states, same for a quote's
 * `subtotal_cdf`/`tax_cdf`/`total_cdf` — one currency per record, not per
 * column. `business_quote_lines` has no column of its own: a line item
 * inherits its parent quote's currency (enforced in the service layer).
 *
 * `project_budgets` gets two independent currency columns
 * (`revenue_budget_currency`/`expense_budget_currency`) since a project's
 * revenue and expense envelopes can reasonably differ — and its existing
 * `currency` column is dropped: dead weight, never read or written by any
 * code path (see git history — bolted on but wired to nothing).
 */
export class AddCurrencyToBusinessAmounts1787500000000 implements MigrationInterface {
  name = 'AddCurrencyToBusinessAmounts1787500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "business_contracts" ADD COLUMN "value_currency" character varying(3) NOT NULL DEFAULT 'CDF'`,
    );
    await queryRunner.query(
      `ALTER TABLE "business_expenses" ADD COLUMN "amount_currency" character varying(3) NOT NULL DEFAULT 'CDF'`,
    );
    await queryRunner.query(
      `ALTER TABLE "business_invoices" ADD COLUMN "currency" character varying(3) NOT NULL DEFAULT 'CDF'`,
    );
    await queryRunner.query(
      `ALTER TABLE "business_opportunities" ADD COLUMN "value_currency" character varying(3) NOT NULL DEFAULT 'CDF'`,
    );
    await queryRunner.query(
      `ALTER TABLE "business_quotes" ADD COLUMN "currency" character varying(3) NOT NULL DEFAULT 'CDF'`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_budgets" ADD COLUMN "revenue_budget_currency" character varying(3) NOT NULL DEFAULT 'CDF'`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_budgets" ADD COLUMN "expense_budget_currency" character varying(3) NOT NULL DEFAULT 'CDF'`,
    );
    await queryRunner.query(`ALTER TABLE "project_budgets" DROP COLUMN "currency"`);
    await queryRunner.query(
      `ALTER TABLE "project_time_entries" ADD COLUMN "hourly_rate_currency" character varying(3) NOT NULL DEFAULT 'CDF'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "project_time_entries" DROP COLUMN "hourly_rate_currency"`);
    await queryRunner.query(`ALTER TABLE "project_budgets" ADD COLUMN "currency" character varying(3) NOT NULL DEFAULT 'CDF'`);
    await queryRunner.query(`ALTER TABLE "project_budgets" DROP COLUMN "expense_budget_currency"`);
    await queryRunner.query(`ALTER TABLE "project_budgets" DROP COLUMN "revenue_budget_currency"`);
    await queryRunner.query(`ALTER TABLE "business_quotes" DROP COLUMN "currency"`);
    await queryRunner.query(`ALTER TABLE "business_opportunities" DROP COLUMN "value_currency"`);
    await queryRunner.query(`ALTER TABLE "business_invoices" DROP COLUMN "currency"`);
    await queryRunner.query(`ALTER TABLE "business_expenses" DROP COLUMN "amount_currency"`);
    await queryRunner.query(`ALTER TABLE "business_contracts" DROP COLUMN "value_currency"`);
  }
}
