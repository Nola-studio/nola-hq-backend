import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessInvoice } from '../business/business-invoice.entity';
import { LEGAL_ENTITY } from '../business/legal-entity.config';

export type VerifyReceiptResponse =
  | { status: 'not_found' }
  | { status: 'voided'; receiptNumber: string; issuedOn: string; voidedOn: string; issuer: string }
  | { status: 'valid'; receiptNumber: string; issuedOn: string; amount: number; currency: string; issuer: string };

/**
 * Public receipt verification (GET /verify/receipt/:token) — deliberately
 * minimal. Returns only receipt number, issue date, amount, currency,
 * issuer name and status: nothing that identifies the payer, the invoice
 * detail, or any other business data. Unknown tokens and voided receipts
 * both come back as ordinary 200 responses with a `status` field, not as
 * HTTP errors — this is a public lookup, not an authenticated resource.
 */
@Injectable()
export class VerifyService {
  constructor(@InjectRepository(BusinessInvoice) private readonly invoices: Repository<BusinessInvoice>) {}

  async verifyReceipt(token: string): Promise<VerifyReceiptResponse> {
    const invoice = token ? await this.invoices.findOne({ where: { verificationToken: token } }) : null;
    if (!invoice || !invoice.receiptNumber) return { status: 'not_found' };

    const issuedOn = (invoice.paidAt ?? invoice.updatedAt).toISOString().slice(0, 10);

    if (invoice.receiptVoidedAt) {
      return {
        status: 'voided',
        receiptNumber: invoice.receiptNumber,
        issuedOn,
        voidedOn: invoice.receiptVoidedAt.toISOString().slice(0, 10),
        issuer: LEGAL_ENTITY.name,
      };
    }

    return {
      status: 'valid',
      receiptNumber: invoice.receiptNumber,
      issuedOn,
      amount: invoice.paidAmountCdf,
      currency: invoice.currency,
      issuer: LEGAL_ENTITY.name,
    };
  }
}
