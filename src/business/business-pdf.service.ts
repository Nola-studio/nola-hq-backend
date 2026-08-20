import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument = require('pdfkit');
import { toBuffer as qrToBuffer } from 'qrcode';
import { amountInWords } from './amount-in-words';
import { BUSINESS_PAYMENT_METHOD_LABELS, type BusinessInvoice } from './business-invoice.entity';
import type { BusinessQuote } from './business-quote.entity';
import { LEGAL_ENTITY } from './legal-entity.config';

const GREEN = '#1F4D3A';
const OCRE = '#D4A053';
const INK = '#17211D';
const MUTE = '#66736D';
const LINE = '#DDE3DF';

@Injectable()
export class BusinessPdfService {
  constructor(private readonly config: ConfigService) {}

  quote(quote: BusinessQuote) {
    return this.build((doc) => {
      this.header(doc, 'DEVIS', quote.number, quote.issuedOn);
      this.parties(doc, quote.client?.name ?? 'Client', quote.client?.email, quote.client?.phone);
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text(quote.title, 50, 225);
      doc.fillColor(MUTE).font('Helvetica').fontSize(9).text(`Valable jusqu'au ${this.date(quote.validUntil)}`, 50, 248);
      this.quoteTable(doc, quote);
      this.notes(doc, quote.paymentTerms, quote.notes);
      this.footer(doc, quote.number);
    });
  }

  invoice(invoice: BusinessInvoice) {
    return this.build((doc) => {
      this.header(doc, 'FACTURE', invoice.number, invoice.issuedOn);
      this.parties(doc, invoice.client?.name ?? 'Client', invoice.client?.email, invoice.client?.phone);
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text(invoice.description || `Prestations ${LEGAL_ENTITY.name}`, 50, 225);
      doc.fillColor(MUTE).font('Helvetica').fontSize(9).text(`Projet : ${invoice.project?.title ?? 'Non renseigné'}`, 50, 248);
      doc.text(`Échéance : ${this.date(invoice.dueOn)}`, 50, 263);
      const totalsY = (invoice.lines?.length ?? 0) > 0 ? this.invoiceLineTable(doc, invoice) : this.invoiceSingleRow(doc, invoice);
      const subtotal = invoice.amountCdf - invoice.taxCdf;
      this.totals(doc, subtotal, invoice.taxCdf, invoice.amountCdf, invoice.taxRate, invoice.currency, totalsY, invoice.taxLabel || 'Taxe');
      doc.fillColor(MUTE).font('Helvetica').fontSize(9).text(`Montant paye : ${this.money(invoice.paidAmountCdf, invoice.currency)}`, 50, totalsY + 83);
      doc.text(`Solde : ${this.money(Math.max(0, invoice.amountCdf - invoice.paidAmountCdf), invoice.currency)}`, 50, totalsY + 99);
      this.footer(doc, invoice.number);
    });
  }

  /** Only for invoices already marked paid (receiptNumber/verificationToken/paymentMethod all set by markPaid()). */
  async receipt(invoice: BusinessInvoice): Promise<Buffer> {
    const verifyUrl = this.verifyUrl(invoice.verificationToken!);
    const qr = await qrToBuffer(verifyUrl, { width: 110, margin: 1, color: { dark: INK, light: '#FFFFFF' } });

    return this.build((doc) => {
      this.header(doc, 'REÇU', invoice.receiptNumber!, (invoice.paidAt ?? new Date()).toISOString().slice(0, 10));
      this.parties(doc, invoice.client?.name ?? 'Client', invoice.client?.email, invoice.client?.phone);
      doc.fillColor(MUTE).font('Helvetica').fontSize(9)
        .text(`Facture : ${invoice.number}`, 50, 222)
        .text(`Mode de paiement : ${BUSINESS_PAYMENT_METHOD_LABELS[invoice.paymentMethod!]}`, 50, 237)
        .text(`Référence de paiement : ${invoice.paymentReference ?? '—'}`, 50, 252);

      const totalsY = (invoice.lines?.length ?? 0) > 0
        ? this.invoiceLineTable(doc, invoice, 282)
        : this.invoiceSingleRow(doc, invoice, 300);
      const subtotal = invoice.amountCdf - invoice.taxCdf;
      this.totals(doc, subtotal, invoice.taxCdf, invoice.amountCdf, invoice.taxRate, invoice.currency, totalsY, invoice.taxLabel || 'Taxe');

      const paidY = totalsY + 95;
      doc.fillColor(OCRE).rect(50, paidY, 495, 40).fill();
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10).text('MONTANT PAYÉ', 62, paidY + 14);
      doc.fontSize(14).text(this.money(invoice.paidAmountCdf, invoice.currency), 300, paidY + 10, { width: 233, align: 'right' });
      doc.fillColor(MUTE).font('Helvetica').fontSize(9)
        .text(`Solde restant : ${this.money(Math.max(0, invoice.amountCdf - invoice.paidAmountCdf), invoice.currency)}`, 50, paidY + 52);
      doc.fillColor(INK).font('Helvetica-Oblique').fontSize(9)
        .text(`Arrêté à la somme de : ${amountInWords(invoice.paidAmountCdf, invoice.currency)}.`, 50, paidY + 70, { width: 495 });

      const qrY = Math.min(660, Math.max(doc.y + 25, paidY + 100));
      doc.image(qr, 50, qrY, { width: 85 });
      doc.fillColor(MUTE).font('Helvetica').fontSize(7)
        .text('Scannez pour vérifier ce reçu, ou consultez :', 150, qrY + 4, { width: 395 })
        .fillColor(INK).font('Helvetica-Bold').fontSize(8).text(verifyUrl, 150, qrY + 17, { width: 395 })
        .fillColor(MUTE).font('Helvetica').fontSize(7).text(`Code : ${invoice.receiptNumber}`, 150, qrY + 34, { width: 395 });

      this.signatureBlocks(doc, qrY + 95);
      this.footer(doc, invoice.receiptNumber!);
    });
  }

  private signatureBlocks(doc: PDFKit.PDFDocument, y: number) {
    doc.strokeColor(LINE).moveTo(50, y).lineTo(255, y).stroke();
    doc.fillColor(MUTE).font('Helvetica').fontSize(8).text('LE CAISSIER', 50, y + 6, { width: 205, align: 'center' });
    doc.strokeColor(LINE).moveTo(340, y).lineTo(545, y).stroke();
    doc.fillColor(MUTE).font('Helvetica').fontSize(8).text('LE PAYEUR', 340, y + 6, { width: 205, align: 'center' });
  }

  private verifyUrl(token: string): string {
    const base = (this.config.get<string>('PUBLIC_APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '');
    return `${base}/verify/receipt/${token}`;
  }

  private invoiceSingleRow(doc: PDFKit.PDFDocument, invoice: BusinessInvoice, startY = 305) {
    const y = startY;
    doc.fillColor(GREEN).rect(50, y, 495, 28).fill();
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9).text('DESCRIPTION', 62, y + 10);
    doc.text('MONTANT', 430, y + 10, { width: 103, align: 'right' });
    doc.fillColor(INK).font('Helvetica').fontSize(10).text(invoice.description || 'Prestations et services', 62, y + 44, { width: 335 });
    doc.font('Helvetica-Bold').text(this.money(invoice.amountCdf, invoice.currency), 430, y + 44, { width: 103, align: 'right' });
    doc.strokeColor(LINE).moveTo(50, y + 70).lineTo(545, y + 70).stroke();
    return y + 95;
  }

  private invoiceLineTable(doc: PDFKit.PDFDocument, invoice: BusinessInvoice, startY = 285) {
    let y = startY;
    const header = () => {
      doc.fillColor(GREEN).rect(50, y, 495, 28).fill();
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8)
        .text('DESCRIPTION', 62, y + 10, { width: 230 })
        .text('QTÉ', 305, y + 10, { width: 45, align: 'right' })
        .text('PRIX UNITAIRE', 360, y + 10, { width: 80, align: 'right' })
        .text('TOTAL', 450, y + 10, { width: 83, align: 'right' });
      y += 38;
    };
    header();
    for (const line of invoice.lines ?? []) {
      const rowHeight = Math.max(31, doc.heightOfString(line.description, { width: 230 }) + 12);
      if (y + rowHeight > 690) { doc.addPage(); y = 60; header(); }
      doc.fillColor(INK).font('Helvetica').fontSize(9).text(line.description, 62, y + 6, { width: 230 });
      doc.text(String(line.quantity), 305, y + 6, { width: 45, align: 'right' });
      doc.text(this.money(line.unitPriceCdf, invoice.currency), 360, y + 6, { width: 80, align: 'right' });
      doc.font('Helvetica-Bold').text(this.money(line.totalCdf, invoice.currency), 450, y + 6, { width: 83, align: 'right' });
      doc.strokeColor(LINE).moveTo(50, y + rowHeight).lineTo(545, y + rowHeight).stroke();
      y += rowHeight;
    }
    return y + 18;
  }

  private build(draw: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Author: LEGAL_ENTITY.name } });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      draw(doc);
      doc.end();
    });
  }

  private header(doc: PDFKit.PDFDocument, kind: string, number: string, date: string) {
    doc.fillColor(GREEN).rect(0, 0, 595.28, 150).fill();
    const [firstWord, ...restWords] = LEGAL_ENTITY.name.toUpperCase().split(' ');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(25).text(firstWord, 50, 42, { continued: true });
    doc.fillColor(OCRE).text(restWords.length ? ` ${restWords.join(' ')}` : '');
    doc.fillColor('#FFFFFF').font('Helvetica').fontSize(9).text(LEGAL_ENTITY.tagline, 50, 76);
    doc.font('Helvetica-Bold').fontSize(22).text(kind, 390, 39, { width: 155, align: 'right' });
    doc.font('Helvetica').fontSize(9).text(number, 390, 71, { width: 155, align: 'right' });
    doc.text(this.date(date), 390, 87, { width: 155, align: 'right' });
  }

  private parties(doc: PDFKit.PDFDocument, name: string, email?: string | null, phone?: string | null) {
    doc.fillColor(MUTE).font('Helvetica-Bold').fontSize(8).text('ADRESSÉE À', 50, 172);
    doc.fillColor(INK).fontSize(11).text(name, 50, 187);
    doc.fillColor(MUTE).font('Helvetica').fontSize(9).text([email, phone].filter(Boolean).join('  |  ') || 'Coordonnées non renseignées', 50, 204);
  }

  private quoteTable(doc: PDFKit.PDFDocument, quote: BusinessQuote) {
    let y = 285;
    const header = () => {
      doc.fillColor(GREEN).rect(50, y, 495, 28).fill();
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8)
        .text('DESCRIPTION', 62, y + 10, { width: 230 })
        .text('QTÉ', 305, y + 10, { width: 45, align: 'right' })
        .text('PRIX UNITAIRE', 360, y + 10, { width: 80, align: 'right' })
        .text('TOTAL', 450, y + 10, { width: 83, align: 'right' });
      y += 38;
    };
    header();
    for (const line of quote.lines ?? []) {
      const rowHeight = Math.max(31, doc.heightOfString(line.description, { width: 230 }) + 12);
      if (y + rowHeight > 690) { doc.addPage(); y = 60; header(); }
      doc.fillColor(INK).font('Helvetica').fontSize(9).text(line.description, 62, y + 6, { width: 230 });
      doc.text(String(line.quantity), 305, y + 6, { width: 45, align: 'right' });
      doc.text(this.money(line.unitPriceCdf, quote.currency), 360, y + 6, { width: 80, align: 'right' });
      doc.font('Helvetica-Bold').text(this.money(line.totalCdf, quote.currency), 450, y + 6, { width: 83, align: 'right' });
      doc.strokeColor(LINE).moveTo(50, y + rowHeight).lineTo(545, y + rowHeight).stroke();
      y += rowHeight;
    }
    this.totals(doc, quote.subtotalCdf, quote.taxCdf, quote.totalCdf, quote.taxRate, quote.currency, y + 18);
  }

  private totals(doc: PDFKit.PDFDocument, subtotal: number, tax: number, total: number, taxRate: number, currency: string, y = 520, label = 'Taxe') {
    doc.fillColor(MUTE).font('Helvetica').fontSize(9).text('Sous-total', 350, y, { width: 90 });
    doc.fillColor(INK).text(this.money(subtotal, currency), 450, y, { width: 83, align: 'right' });
    doc.fillColor(MUTE).text(`${label} (${taxRate}%)`, 350, y + 19, { width: 90 });
    doc.fillColor(INK).text(this.money(tax, currency), 450, y + 19, { width: 83, align: 'right' });
    doc.fillColor(GREEN).rect(340, y + 42, 205, 34).fill();
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10).text('TOTAL', 352, y + 54);
    doc.text(this.money(total, currency), 435, y + 54, { width: 98, align: 'right' });
  }

  private notes(doc: PDFKit.PDFDocument, terms?: string | null, notes?: string | null) {
    const y = Math.min(690, Math.max(doc.y + 35, 635));
    if (terms) {
      doc.fillColor(MUTE).font('Helvetica-Bold').fontSize(8).text('CONDITIONS DE PAIEMENT', 50, y);
      doc.fillColor(INK).font('Helvetica').fontSize(8).text(terms, 50, y + 14, { width: 250 });
    }
    if (notes) {
      doc.fillColor(MUTE).font('Helvetica-Bold').fontSize(8).text('NOTES', 50, y + 44);
      doc.fillColor(INK).font('Helvetica').fontSize(8).text(notes, 50, y + 58, { width: 400 });
    }
  }

  private footer(doc: PDFKit.PDFDocument, reference: string) {
    const bottom = doc.page.height - 62;
    doc.strokeColor(LINE).moveTo(50, bottom - 12).lineTo(545, bottom - 12).stroke();
    doc.fillColor(MUTE).font('Helvetica').fontSize(7).text(LEGAL_ENTITY.footerLine, 50, bottom, { width: 350, lineBreak: false });
    doc.text(reference, 400, bottom, { width: 145, align: 'right', lineBreak: false });
  }

  private money(value: number, currency: string) {
    return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value).replace(/[\u202f\u00a0]/g, ' ')} ${currency}`;
  }

  private date(value: string) {
    return new Intl.DateTimeFormat('fr-CA', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
  }
}
