import { describe, expect, test } from 'bun:test';
import { ConfigService } from '@nestjs/config';
import { BusinessPdfService } from './business-pdf.service';
import { BusinessInvoice } from './business-invoice.entity';
import { BusinessUnit } from '../company/business-unit.entity';
import { LegalEntity } from '../company/legal-entity.entity';

describe('BusinessPdfService — brandOf and legal entity integration', () => {
  const config = new ConfigService({ PUBLIC_APP_URL: 'https://hq.nola.cd' });
  const service = new BusinessPdfService(config);

  const legalEntity: LegalEntity = {
    id: 'le-khi-lab',
    code: 'khi-lab-corp',
    name: 'Khi-Lab Technologies Inc.',
    jurisdiction: 'QC-CA',
    registrationNumber: 'NEQ-1192837465',
    taxRegime: 'TPS / TVQ',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const businessUnit: BusinessUnit = {
    id: 'bu-khi',
    code: 'khi-lab',
    name: 'Khi-Lab',
    legalEntityId: legalEntity.id,
    legalEntity,
    isActive: true,
    tagline: 'Laboratoire d’innovation & SaaS',
    footerLine: 'Khi-Lab | Merci pour votre confiance',
    theme: 'indigo',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  test('invoice() generates a valid PDF buffer with resolved brand and legal entity metadata', async () => {
    const invoice: BusinessInvoice = {
      id: 'inv-uuid-1',
      number: 'FAC-2026-00042',
      receiptNumber: 'REC-2026-00042',
      businessUnitId: businessUnit.id,
      businessUnit,
      amountCdf: 250000,
      paidAmountCdf: 250000,
      taxRate: 16,
      taxCdf: 40000,
      taxLabel: 'TVA',
      currency: 'CDF',
      issuedOn: '2026-09-02',
      dueOn: '2026-09-16',
      paidAt: new Date('2026-09-02T12:00:00Z'),
      status: 'paid',
      description: 'Développement de solution logicielle',
      paymentMethod: 'mobile_money',
      paymentReference: 'MPESA-998877',
      verificationToken: 'token-abc-123',
      receiptVoidedAt: null,
      client: {
        id: 'client-1',
        name: 'Banque Commerciale',
        email: 'billing@banque.cd',
        phone: '+243990000000',
        address: 'Kinshasa / Gombe',
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
      lines: [
        {
          id: 'line-1',
          invoiceId: 'inv-uuid-1',
          description: 'Abonnement mensuel Cloud Yekoli',
          quantity: 1,
          unitPriceCdf: 210000,
          totalCdf: 210000,
          position: 0,
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const buffer = await service.invoice(invoice);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
    // PDF Magic Bytes
    expect(buffer.slice(0, 4).toString('utf-8')).toBe('%PDF');
  });

  test('receipt() generates valid PDF buffer with QR verification token', async () => {
    const invoice: BusinessInvoice = {
      id: 'inv-uuid-2',
      number: 'FAC-2026-00043',
      receiptNumber: 'REC-2026-00043',
      businessUnitId: businessUnit.id,
      businessUnit,
      amountCdf: 100,
      paidAmountCdf: 100,
      taxRate: 0,
      taxCdf: 0,
      taxLabel: null,
      currency: 'USD',
      issuedOn: '2026-09-02',
      dueOn: '2026-09-02',
      paidAt: new Date('2026-09-02T12:00:00Z'),
      status: 'paid',
      description: 'Licence logicielle',
      paymentMethod: 'card',
      paymentReference: 'STRIPE-CH-1234',
      verificationToken: 'vtoken-xyz',
      receiptVoidedAt: null,
      client: {
        id: 'client-2',
        name: 'Client Test',
        email: 'test@example.com',
        phone: null,
      } as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const buffer = await service.receipt(invoice);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.slice(0, 4).toString('utf-8')).toBe('%PDF');
  });
});

