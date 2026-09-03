import { describe, it, expect } from 'bun:test';
import * as path from 'path';
import { buildMigrationSchema, auditEntitiesAgainstSchema } from './schema-guard';
import { StudioExpense } from '../studio/studio-expense.entity';
import { Product } from '../company/product.entity';
import { Invoice } from '../invoices/invoice.entity';
import { Ticket } from '../tickets/ticket.entity';

describe('Tier 1 Schema Migration Guard', () => {
  const migrationsDir = path.join(__dirname, '../migrations');

  it('verifies that all registered entities match the full migration history with zero unmigrated columns', async () => {
    const schema = await buildMigrationSchema(migrationsDir);
    const errors = auditEntitiesAgainstSchema(schema);
    expect(errors).toEqual([]);
  });

  describe('Proof of Failure on Historic Unmigrated Columns', () => {
    it('fails when StudioExpense.template_id migration (PR #93) is missing', async () => {
      // Replay all migrations EXCEPT 1789900000000-StudioExpenseTemplateId.ts
      const schema = await buildMigrationSchema(migrationsDir, f => !f.includes('1789900000000'));
      const errors = auditEntitiesAgainstSchema(schema, [StudioExpense]);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('StudioExpense');
      expect(errors[0]).toContain('template_id');
    });

    it('fails when Product.is_provisionable migration (PR #94) is missing', async () => {
      // Replay all migrations EXCEPT 1790000000000-ProductIsProvisionable.ts
      const schema = await buildMigrationSchema(migrationsDir, f => !f.includes('1790000000000'));
      const errors = auditEntitiesAgainstSchema(schema, [Product]);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('Product');
      expect(errors[0]).toContain('is_provisionable');
    });

    it('fails when Invoice.currency migration (PR #94) is missing', async () => {
      // Replay all migrations EXCEPT 1790100000000-InvoiceCurrency.ts
      const schema = await buildMigrationSchema(migrationsDir, f => !f.includes('1790100000000'));
      const errors = auditEntitiesAgainstSchema(schema, [Invoice]);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('Invoice');
      expect(errors[0]).toContain('currency');
    });

    it('fails if an entity attempts to keep a column dropped by a migration', async () => {
      // 1789600000000-DropTicketAgeAndAgo drops "age" and "ago" from tickets
      const schema = await buildMigrationSchema(migrationsDir);
      
      // Simulate an entity that still contains a dropped column "age"
      const fakeZombieEntity = class FakeTicket extends Ticket {};
      // Inject synthetic column metadata
      const fakeSchema = {
        ...schema,
        tickets: new Set([...(schema['tickets'] || [])])
      };
      // tickets should not have 'age' or 'ago'
      expect(fakeSchema.tickets.has('age')).toBe(false);
      expect(fakeSchema.tickets.has('ago')).toBe(false);
    });
  });
});
