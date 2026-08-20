import { test, expect, describe, mock } from 'bun:test';
import { VerifyService } from './verify.service';

function makeService(invoice: unknown) {
  const invoices = { findOne: mock(async () => invoice) } as any;
  return new VerifyService(invoices);
}

describe('VerifyService.verifyReceipt — public response shape', () => {
  test('unknown token returns not_found, not an error', async () => {
    const svc = makeService(null);
    const result = await svc.verifyReceipt('does-not-exist');
    expect(result).toEqual({ status: 'not_found' });
  });

  test('empty token short-circuits to not_found without querying', async () => {
    const invoices = { findOne: mock(async () => null) } as any;
    const svc = new VerifyService(invoices);
    const result = await svc.verifyReceipt('');
    expect(result).toEqual({ status: 'not_found' });
    expect(invoices.findOne).not.toHaveBeenCalled();
  });

  test('a matched-but-unreceipted invoice (defensive: should never happen — token is only ever set alongside receiptNumber) reports not_found', async () => {
    const svc = makeService({ receiptNumber: null, verificationToken: 'tok' });
    const result = await svc.verifyReceipt('tok');
    expect(result).toEqual({ status: 'not_found' });
  });

  test('a valid receipt returns exactly: status, receiptNumber, issuedOn, amount, currency, issuer', async () => {
    const svc = makeService({
      receiptNumber: 'REC-2026-00001',
      verificationToken: 'tok',
      receiptVoidedAt: null,
      paidAt: new Date('2026-08-10T12:00:00Z'),
      paidAmountCdf: 1_150,
      currency: 'USD',
    });
    const result = await svc.verifyReceipt('tok');
    expect(result).toEqual({
      status: 'valid',
      receiptNumber: 'REC-2026-00001',
      issuedOn: '2026-08-10',
      amount: 1_150,
      currency: 'USD',
      issuer: 'Nolaa Studio',
    });
  });

  test('a voided receipt reports voidedOn and drops amount/currency', async () => {
    const svc = makeService({
      receiptNumber: 'REC-2026-00002',
      verificationToken: 'tok',
      receiptVoidedAt: new Date('2026-08-12T09:00:00Z'),
      paidAt: new Date('2026-08-10T12:00:00Z'),
      paidAmountCdf: 500,
      currency: 'CDF',
    });
    const result = await svc.verifyReceipt('tok');
    expect(result).toEqual({
      status: 'voided',
      receiptNumber: 'REC-2026-00002',
      issuedOn: '2026-08-10',
      voidedOn: '2026-08-12',
      issuer: 'Nolaa Studio',
    });
    expect(result).not.toHaveProperty('amount');
  });

  test('never leaks payer name, invoice number, line items, or payment reference', async () => {
    const svc = makeService({
      receiptNumber: 'REC-2026-00003',
      verificationToken: 'tok',
      receiptVoidedAt: null,
      paidAt: new Date('2026-08-10T12:00:00Z'),
      paidAmountCdf: 100,
      currency: 'USD',
      // fields that must never appear in the public response:
      client: { name: 'Confidential Client' },
      number: 'FAC-2026-00007',
      paymentReference: 'BANK-SECRET-REF',
      paymentMethod: 'bank_transfer',
      lines: [{ description: 'sensitive line item' }],
    });
    const result = await svc.verifyReceipt('tok');
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('Confidential Client');
    expect(serialized).not.toContain('FAC-2026-00007');
    expect(serialized).not.toContain('BANK-SECRET-REF');
    expect(serialized).not.toContain('sensitive line item');
  });
});
