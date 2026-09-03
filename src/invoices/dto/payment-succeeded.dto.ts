/**
 * Wire shape of the `payment.succeeded` event published by nola-billing
 * on `nola.events.billing.payment.succeeded` or `nola.events.payment.succeeded`.
 */
export interface PaymentSucceededEventPayload {
  /** Unique payment identifier in nola-billing (or payment gateway reference). */
  paymentId?: string;

  /** Target billing invoice id, if linked. */
  invoiceId?: string;

  /** Numeric amount paid (e.g. 50 or "50.00"). */
  amount: number | string;

  /** ISO 4217 currency code (e.g. 'USD', 'CDF'). */
  currency: string;

  /** Payment rail/provider — e.g. 'mobile_money', 'card', 'bank_transfer', 'mpesa', 'airtel'. */
  provider?: string;
  paymentMethod?: string;
  method?: string;

  /** External reference or gateway transaction ID. */
  reference?: string | null;

  /** Tenant receiving the subscription/service. */
  tenantId: string;

  /** Product/app code (e.g. 'yekoli', 'k-river', 'mycvmatcher') or alias ('kelasi-owner-app'). */
  appId?: string;
  productCode?: string;

  /** Recipient email for the branded invoice/receipt notification. */
  customerEmail?: string | null;
  customerName?: string | null;

  /** ISO timestamp of when the payment succeeded. */
  paidAt?: string | null;

  /** Human-readable description (e.g. "Abonnement Yekoli Pro Mensuel"). */
  description?: string | null;

  /** Optional arbitrary metadata. */
  metadata?: Record<string, unknown>;
}

