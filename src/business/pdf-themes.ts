import type { BusinessUnit } from '../company/business-unit.entity';

/** Literal hex values transcribed from `design/pdf-layout.md` §4 — do not re-derive from the HTML reference. */
export interface PdfTheme {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  accent: string;
  badgeBg: string;
  badgeText: string;
  highlightZero: string;
}

export const PDF_THEMES: Record<'emerald' | 'navy' | 'indigo' | 'slate', PdfTheme> = {
  emerald: {
    // Yekoli school tenants — reference only, no HQ business unit uses this.
    primary: '#0F5132',
    primaryDark: '#0A3622',
    primaryLight: '#E8F5E9',
    accent: '#198754',
    badgeBg: '#DCFCE7',
    badgeText: '#15803D',
    highlightZero: '#198754',
  },
  navy: {
    // Vantelis IT
    primary: '#1E3A8A',
    primaryDark: '#172554',
    primaryLight: '#EFF6FF',
    accent: '#2563EB',
    badgeBg: '#DBEAFE',
    badgeText: '#1E40AF',
    highlightZero: '#2563EB',
  },
  indigo: {
    // Khi-Lab — also the fallback when BusinessUnit.theme is null.
    primary: '#4338CA',
    primaryDark: '#312E81',
    primaryLight: '#EEF2FF',
    accent: '#6366F1',
    badgeBg: '#E0E7FF',
    badgeText: '#3730A3',
    highlightZero: '#4F46E5',
  },
  slate: {
    // Nolaa Corp / Studio HQ
    primary: '#0F172A',
    primaryDark: '#020617',
    primaryLight: '#F1F5F9',
    accent: '#334155',
    badgeBg: '#E2E8F0',
    badgeText: '#0F172A',
    highlightZero: '#166534',
  },
};

export const PDF_NEUTRALS = {
  surface: '#FFFFFF',
  backgroundCard: '#F8FAFC',
  paymentBoxBg: '#FAFAFA',
  textMain: '#1E293B',
  textMuted: '#64748B',
  textLight: '#94A3B8',
  border: '#E2E8F0',
  borderFocus: '#CBD5E1',
  badgeGrayBg: '#EEF2F6',
};

/**
 * `BusinessUnit.theme` is nullable — a unit that predates this column, or
 * was created without an explicit choice, resolves to `'indigo'`
 * (khi-lab's own palette). Same "unset falls back to the system default
 * brand" precedent as `DEFAULT_BUSINESS_UNIT_CODE = 'khi-lab'`
 * (`business-unit-resolver.service.ts`) — one default concept, not two.
 */
export function resolvePdfTheme(unit?: Pick<BusinessUnit, 'theme'> | null): PdfTheme {
  return PDF_THEMES[unit?.theme ?? 'indigo'];
}
