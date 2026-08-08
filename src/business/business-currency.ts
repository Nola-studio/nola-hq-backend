/**
 * Currencies the Business module accepts on entry — deliberately narrow
 * (not Studio's CAD|USD|CDF|XAF) and no exchange rate anywhere: each amount
 * is stored and displayed in whatever currency it was entered in, never
 * converted or summed against another currency.
 */
export const BUSINESS_CURRENCIES = ['USD', 'CDF', 'CAD'] as const;
export type BusinessCurrency = (typeof BUSINESS_CURRENCIES)[number];

/** Schema-level default — matches every historical row, which really is CDF.
 *  Not the same as the frontend's new-entry default (USD): that's a form
 *  affordance, this is what an omitted/absent value means. */
export const DEFAULT_BUSINESS_CURRENCY: BusinessCurrency = 'CDF';
