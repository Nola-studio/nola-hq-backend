import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument = require('pdfkit');
import { toBuffer as qrToBuffer } from 'qrcode';
import { amountInWords } from './amount-in-words';
import type { BusinessUnit } from '../company/business-unit.entity';
import { BUSINESS_PAYMENT_METHOD_LABELS, type BusinessInvoice, type BusinessInvoiceStatus } from './business-invoice.entity';
import type { BusinessQuote, BusinessQuoteStatus } from './business-quote.entity';
import { LEGAL_ENTITY } from './legal-entity.config';
import { PDF_NEUTRALS, resolvePdfTheme, type PdfTheme } from './pdf-themes';
import { registerPdfFonts } from './pdf-fonts';
import {
  PAGE,
  header,
  metaCards,
  itemsTableHeader,
  itemsTableRow,
  itemsTableContainer,
  paymentBox,
  totalsBlock,
  signatureBlock,
  footer,
  pageNumberStamp,
  topAccentBar,
  type ItemsTableColumns,
  type ItemRow,
} from './pdf-primitives';

/** The brand as it drives PDF rendering: display strings + resolved color palette. Null tagline/footerLine fall back to `LEGAL_ENTITY`'s (e.g. `nolaa-corp`, which carries no override); null theme falls back to `'indigo'` via `resolvePdfTheme`. */
interface DocumentBrand {
  name: string;
  tagline: string;
  footerLine: string;
  theme: PdfTheme;
}

const INVOICE_STATUS_LABELS: Record<BusinessInvoiceStatus, string> = {
  draft: 'Brouillon',
  sent: 'Envoyée',
  partial: 'Partielle',
  paid: 'Payée',
  overdue: 'En retard',
  cancelled: 'Annulée',
};

const QUOTE_STATUS_LABELS: Record<BusinessQuoteStatus, string> = {
  draft: 'Brouillon',
  sent: 'Envoyé',
  accepted: 'Accepté',
  rejected: 'Refusé',
  expired: 'Expiré',
};

const RECEIPT_COLUMNS: Omit<ItemsTableColumns, 'descWidth' | 'qtyWidth' | 'unitWidth' | 'totalWidth'> = {
  descLabel: 'Description',
  qtyLabel: 'Qté',
  unitLabel: 'Prix unitaire',
  totalLabel: 'Montant',
};

const SERVICE_COLUMNS: Omit<ItemsTableColumns, 'descWidth' | 'qtyWidth' | 'unitWidth' | 'totalWidth'> = {
  descLabel: 'Prestation / Description',
  qtyLabel: 'Qté',
  unitLabel: 'Taux unitaire',
  totalLabel: 'Montant HT',
};

const TABLE_COLUMN_WIDTHS = { descWidth: 245, qtyWidth: 40, unitWidth: 105, totalWidth: 105 };

@Injectable()
export class BusinessPdfService {
  constructor(private readonly config: ConfigService) {}

  quote(quote: BusinessQuote): Promise<Buffer> {
    const brand = this.brandOf(quote.businessUnit);
    return this.build(brand, (doc) => {
      topAccentBar(doc, brand.theme);
      header(doc, {
        monogram: this.monogram(brand.name),
        brandName: brand.name,
        brandSub: brand.tagline,
        badge: 'DEVIS',
        title: 'DEVIS',
        number: `N° ${quote.number}`,
        theme: brand.theme,
      });
      metaCards(doc, 108, {
        card1Label: 'Facturé à / Client',
        card1Name: quote.client?.name ?? 'Client',
        card1Detail: this.contactLine(quote.client?.email, quote.client?.phone),
        card2Label: 'Détails du document',
        card2Rows: [
          { label: "Date d'émission :", value: this.date(quote.issuedOn) },
          { label: "Valable jusqu'au :", value: this.date(quote.validUntil), mono: true },
          { label: 'Statut :', value: QUOTE_STATUS_LABELS[quote.status] },
        ],
        card2StatusPill: { label: QUOTE_STATUS_LABELS[quote.status], theme: brand.theme },
      });

      const rows: ItemRow[] = (quote.lines ?? []).map((line) => ({
        description: line.description,
        qty: String(line.quantity),
        unitPrice: this.money(line.unitPriceCdf, quote.currency),
        total: this.money(line.totalCdf, quote.currency),
      }));
      const tableBottom = this.drawItemsTable(doc, 200, rows, SERVICE_COLUMNS);

      const financialY = Math.max(325, tableBottom + 20);
      if (quote.paymentTerms || quote.notes) {
        paymentBox(doc, {
          x: 50,
          y: financialY,
          width: 260,
          height: 110,
          title: 'Modalités & Conditions de Paiement',
          pills: [],
          bodyText: [quote.paymentTerms, quote.notes].filter(Boolean).join(' — ') || undefined,
        });
      }
      totalsBlock(doc, {
        x: 325,
        y: financialY,
        width: 220,
        rows: [
          { label: 'Sous-total HT :', value: this.money(quote.subtotalCdf, quote.currency) },
          { label: `Taxe (${quote.taxRate}%) :`, value: this.money(quote.taxCdf, quote.currency) },
        ],
        grandLabel: 'Net à Payer',
        grandValue: this.money(quote.totalCdf, quote.currency),
        wordsLine: `Arrêté à la somme de : ${amountInWords(quote.totalCdf, quote.currency)}.`,
        theme: brand.theme,
      });

      const sigY = financialY + 122;
      doc.moveTo(50, sigY - 8).lineTo(545, sigY - 8).strokeColor(PDF_NEUTRALS.border).stroke();
      signatureBlock(doc, sigY, [
        { width: 240, kind: 'stamp', stampLabel: 'Cachet & Signature', caption: 'Pour le prestataire' },
        { width: 240, kind: 'stamp', stampLabel: 'Bon pour accord', caption: 'Pour le client' },
      ]);

      this.drawFooter(doc, brand, 1, 1);
    });
  }

  invoice(invoice: BusinessInvoice): Promise<Buffer> {
    const brand = this.brandOf(invoice.businessUnit);
    return this.build(brand, (doc) => {
      topAccentBar(doc, brand.theme);
      header(doc, {
        monogram: this.monogram(brand.name),
        brandName: brand.name,
        brandSub: brand.tagline,
        badge: 'FACTURE',
        title: 'FACTURE',
        number: `N° ${invoice.number}`,
        theme: brand.theme,
      });
      metaCards(doc, 108, {
        card1Label: 'Facturé à / Client',
        card1Name: invoice.client?.name ?? 'Client',
        card1Detail: this.contactLine(invoice.client?.email, invoice.client?.phone) + (invoice.project?.title ? `  •  Réf : ${invoice.project.title}` : ''),
        card2Label: 'Détails du document',
        card2Rows: [
          { label: "Date d'émission :", value: this.date(invoice.issuedOn) },
          { label: 'Échéance :', value: this.date(invoice.dueOn), mono: true },
          { label: 'Statut :', value: INVOICE_STATUS_LABELS[invoice.status] },
        ],
        card2StatusPill: { label: INVOICE_STATUS_LABELS[invoice.status], theme: brand.theme },
      });

      const rows: ItemRow[] =
        (invoice.lines?.length ?? 0) > 0
          ? invoice.lines!.map((line) => ({
              description: line.description,
              qty: String(line.quantity),
              unitPrice: this.money(line.unitPriceCdf, invoice.currency),
              total: this.money(line.totalCdf, invoice.currency),
            }))
          : [
              {
                description: invoice.description || 'Prestations et services',
                qty: '1',
                unitPrice: this.money(invoice.amountCdf - invoice.taxCdf, invoice.currency),
                total: this.money(invoice.amountCdf - invoice.taxCdf, invoice.currency),
              },
            ];
      const tableBottom = this.drawItemsTable(doc, 200, rows, SERVICE_COLUMNS);

      const financialY = Math.max(325, tableBottom + 20);
      // Payment box deliberately omitted: BusinessInvoice has no paymentTerms/notes
      // field, and paymentMethod/paymentReference are null until markPaid() runs —
      // rendering pills here would mean inventing data. The 260pt column stays blank.
      const subtotal = invoice.amountCdf - invoice.taxCdf;
      totalsBlock(doc, {
        x: 325,
        y: financialY,
        width: 220,
        rows: [
          { label: 'Sous-total HT :', value: this.money(subtotal, invoice.currency) },
          { label: `${invoice.taxLabel || 'Taxe'} (${invoice.taxRate}%) :`, value: this.money(invoice.taxCdf, invoice.currency) },
        ],
        grandLabel: 'Net à Payer',
        grandValue: this.money(invoice.amountCdf, invoice.currency),
        wordsLine: `Arrêté à la somme de : ${amountInWords(invoice.amountCdf, invoice.currency)}.`,
        theme: brand.theme,
      });

      const sigY = financialY + 122;
      doc.moveTo(50, sigY - 8).lineTo(545, sigY - 8).strokeColor(PDF_NEUTRALS.border).stroke();
      signatureBlock(doc, sigY, [
        { width: 240, kind: 'stamp', stampLabel: 'Cachet & Signature', caption: 'Pour le prestataire' },
        { width: 240, kind: 'stamp', stampLabel: 'Bon pour accord', caption: 'Pour le client' },
      ]);

      this.drawFooter(doc, brand, 1, 1);
    });
  }

  /** Only for invoices already marked paid (receiptNumber/verificationToken/paymentMethod all set by markPaid()). */
  async receipt(invoice: BusinessInvoice): Promise<Buffer> {
    const brand = this.brandOf(invoice.businessUnit);
    const verifyUrl = this.verifyUrl(invoice.verificationToken!);
    const qr = await qrToBuffer(verifyUrl, { width: 200, margin: 1, color: { dark: PDF_NEUTRALS.textMain, light: '#FFFFFF' } });

    return this.build(brand, (doc) => {
      topAccentBar(doc, brand.theme);
      header(doc, {
        monogram: this.monogram(brand.name),
        brandName: brand.name,
        brandSub: brand.tagline,
        badge: 'REÇU',
        title: 'REÇU DE PAIEMENT',
        number: `N° ${invoice.receiptNumber}`,
        theme: brand.theme,
      });
      metaCards(doc, 108, {
        card1Label: 'Facturé à / Client',
        card1Name: invoice.client?.name ?? 'Client',
        card1Detail: this.contactLine(invoice.client?.email, invoice.client?.phone),
        card2Label: "Détails de l'opération",
        card2Rows: [
          { label: 'Date :', value: this.date((invoice.paidAt ?? new Date()).toISOString().slice(0, 10)) },
          { label: 'Facture associée :', value: invoice.number, mono: true },
          { label: 'Statut du solde :', value: 'Soldé' },
        ],
        card2StatusPill: { label: 'Soldé', theme: brand.theme },
      });

      const rows: ItemRow[] =
        (invoice.lines?.length ?? 0) > 0
          ? invoice.lines!.map((line) => ({
              description: line.description,
              qty: String(line.quantity),
              unitPrice: this.money(line.unitPriceCdf, invoice.currency),
              total: this.money(line.totalCdf, invoice.currency),
            }))
          : [
              {
                description: invoice.description || 'Prestations et services',
                qty: '1',
                unitPrice: this.money(invoice.amountCdf - invoice.taxCdf, invoice.currency),
                total: this.money(invoice.amountCdf - invoice.taxCdf, invoice.currency),
              },
            ];
      const tableBottom = this.drawItemsTable(doc, 200, rows, RECEIPT_COLUMNS);

      const financialY = Math.max(325, tableBottom + 20);
      paymentBox(doc, {
        x: 50,
        y: financialY,
        width: 260,
        height: 110,
        title: 'Mode de Règlement',
        pills: [
          { label: BUSINESS_PAYMENT_METHOD_LABELS[invoice.paymentMethod!], bg: brand.theme.primaryLight, text: brand.theme.primaryDark },
          { label: `Réf. ${invoice.paymentReference ?? '—'}`, bg: PDF_NEUTRALS.badgeGrayBg, text: PDF_NEUTRALS.textMain, mono: true },
        ],
        bodyText: 'Reçu émis informatiquement via Nolaa HQ. Ce document fait foi de quittance officielle de paiement.',
      });
      // No partial payments: paidAmountCdf === amountCdf by the time markPaid() has
      // run, so "reste à payer" is always 0 — still computed rather than hardcoded,
      // in case that invariant is ever revisited elsewhere.
      const balance = Math.max(0, invoice.amountCdf - invoice.paidAmountCdf);
      totalsBlock(doc, {
        x: 325,
        y: financialY,
        width: 220,
        rows: [
          { label: 'Total facture :', value: this.money(invoice.amountCdf, invoice.currency) },
          { label: 'Déjà versé :', value: this.money(invoice.paidAmountCdf, invoice.currency) },
          { label: 'Reste à payer :', value: this.money(balance, invoice.currency), color: brand.theme.highlightZero },
        ],
        grandLabel: 'Montant Payé',
        grandValue: this.money(invoice.paidAmountCdf, invoice.currency),
        wordsLine: `Arrêté à la somme de : ${amountInWords(invoice.paidAmountCdf, invoice.currency)}.`,
        theme: brand.theme,
      });

      const sigY = financialY + 122;
      doc.moveTo(50, sigY - 8).lineTo(545, sigY - 8).strokeColor(PDF_NEUTRALS.border).stroke();
      signatureBlock(doc, sigY, [
        { width: 125, kind: 'qr', qrImage: qr, qrCaption: 'Authenticité', qrToken: invoice.receiptNumber!, caption: '' },
        { width: 170, kind: 'stamp', stampLabel: 'Sceau / Signature', caption: 'Le Caissier' },
        { width: 170, kind: 'stamp', stampLabel: 'Signature', caption: 'Le Payeur' },
      ]);

      this.drawFooter(doc, brand, 1, 1);
    });
  }

  // ── shared composition helpers ──────────────────────────────────────

  /** Draws the header band + all rows (single page — pagination wraps this in a later change) and the outer rounded border once the total height is known. Returns the Y just past the table. */
  private drawItemsTable(doc: PDFKit.PDFDocument, startY: number, rows: ItemRow[], labels: Omit<ItemsTableColumns, 'descWidth' | 'qtyWidth' | 'unitWidth' | 'totalWidth'>): number {
    const cols: ItemsTableColumns = { ...TABLE_COLUMN_WIDTHS, ...labels };
    let y = itemsTableHeader(doc, 50, startY, cols);
    for (const item of rows) {
      y += itemsTableRow(doc, 50, y, cols, item);
    }
    itemsTableContainer(doc, 50, startY, PAGE.contentWidth, y - startY);
    return y;
  }

  private drawFooter(doc: PDFKit.PDFDocument, brand: DocumentBrand, page: number, totalPages: number): void {
    if (page === totalPages) {
      footer(doc, 755, { brandLine: brand.footerLine, monogram: this.monogram(brand.name), theme: brand.theme, rightText: 'Nolaa Studio Inc.' });
    } else {
      pageNumberStamp(doc, page, totalPages);
    }
  }

  private monogram(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?';
  }

  private contactLine(email?: string | null, phone?: string | null): string {
    return [email, phone].filter(Boolean).join('  •  ') || 'Coordonnées non renseignées';
  }

  private brandOf(unit?: BusinessUnit | null): DocumentBrand {
    return {
      name: unit?.name ?? LEGAL_ENTITY.name,
      tagline: unit?.tagline ?? LEGAL_ENTITY.tagline,
      footerLine: unit?.footerLine ?? LEGAL_ENTITY.footerLine,
      theme: resolvePdfTheme(unit),
    };
  }

  private verifyUrl(token: string): string {
    const base = (this.config.get<string>('PUBLIC_APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '');
    return `${base}/verify/receipt/${token}`;
  }

  private build(brand: DocumentBrand, draw: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Author: brand.name } });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      registerPdfFonts(doc);
      draw(doc);
      doc.end();
    });
  }

  private money(value: number, currency: string) {
    return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value).replace(/[  ]/g, ' ')} ${currency}`;
  }

  /**
   * DD/MM/AAAA — matches the reference mockups' own `[JJ / MM / AAAA]`
   * placeholder format exactly. Every date on this design lives in a narrow
   * mono-font value column (meta-card key-value rows); a spelled-out long
   * format ("18 septembre 2026") overflows that column and wraps into the
   * row below it — confirmed by rendering and visually inspecting a sample
   * PDF before settling on this format.
   */
  private date(value: string) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
}
