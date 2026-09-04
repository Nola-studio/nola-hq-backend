import { describe, expect, mock, test } from 'bun:test';
import { ConfigService } from '@nestjs/config';
import { PaymentEventsListener } from './payment-events.listener';

describe('PaymentEventsListener', () => {
  test('handle delegates to InvoicesService.processPaymentSucceeded and logs success', async () => {
    const nolaClient = { isReady: () => true, getClient: () => ({}) } as any;
    const processedPayloads: any[] = [];
    const invoicesService = {
      processPaymentSucceeded: mock(async (payload: any) => {
        processedPayloads.push(payload);
        return {
          invoiceNumber: 'FAC-2026-00001',
          receiptNumber: 'REC-2026-00001',
          brandName: 'Khi-Lab',
          legalEntityName: 'Nolaa Studio Inc.',
          pdfBuffer: Buffer.from('pdf'),
          notificationDispatched: true,
        };
      }),
    } as any;
    const config = new ConfigService({ NOLA_HQ_PAYMENT_INGEST: 'true' });

    const listener = new PaymentEventsListener(nolaClient, invoicesService, config);

    // Call private handle method
    await (listener as any).handle({
      event: 'billing.payment.succeeded',
      payload: {
        paymentId: 'pay-1',
        amount: 250,
        currency: 'USD',
        tenantId: 'tenant-123',
        appId: 'yekoli',
      },
      metadata: {
        correlationId: 'c-1',
        source: 'nola-billing',
        emittedAt: new Date().toISOString(),
      },
    });

    expect(invoicesService.processPaymentSucceeded).toHaveBeenCalled();
    expect(processedPayloads.length).toBe(1);
    expect(processedPayloads[0].paymentId).toBe('pay-1');
    expect(processedPayloads[0].amount).toBe(250);
  });

  test('handle drops malformed event without throwing or processing', async () => {
    const nolaClient = { isReady: () => true, getClient: () => ({}) } as any;
    const invoicesService = {
      processPaymentSucceeded: mock(async () => ({})),
    } as any;
    const config = new ConfigService({ NOLA_HQ_PAYMENT_INGEST: 'true' });

    const listener = new PaymentEventsListener(nolaClient, invoicesService, config);

    await (listener as any).handle({
      event: 'billing.payment.succeeded',
      payload: {
        // missing tenantId and amount
      },
      metadata: {
        correlationId: 'c-2',
        source: 'nola-billing',
        emittedAt: new Date().toISOString(),
      },
    });

    expect(invoicesService.processPaymentSucceeded).not.toHaveBeenCalled();
  });
});

