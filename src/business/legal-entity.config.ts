/**
 * Single source of truth for the legal-entity strings baked into
 * business-facing PDFs (quotes, invoices). Quebec incorporation isn't
 * finalized yet, so `address`, `taxId`, `registrationNumber` are
 * intentionally omitted rather than placeholdered — add them once real
 * values exist instead of guessing.
 *
 * `name` uses the double-a spelling ("Nolaa Studio"), matching its
 * majority usage across the frontend (Business.tsx, Landing.tsx,
 * CommandPalette.tsx).
 */
export const LEGAL_ENTITY = {
  name: 'Nolaa Studio',
  tagline: 'Solutions numériques et accompagnement business',
  footerLine: 'Nolaa Studio | Merci pour votre confiance',
};
