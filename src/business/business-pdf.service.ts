import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import type { BusinessInvoice } from './business-invoice.entity';
import type { BusinessQuote } from './business-quote.entity';

const GREEN = '#1F4D3A';
const OCRE = '#D4A053';
const INK = '#17211D';
const MUTE = '#66736D';
const LINE = '#DDE3DF';

@Injectable()
export class BusinessPdfService {
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
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text(invoice.description || 'Prestations Nola Studio', 50, 225);
      doc.fillColor(MUTE).font('Helvetica').fontSize(9).text(`Projet : ${invoice.project?.title ?? 'Non renseigne'}`, 50, 248);
      doc.text(`Echeance : ${this.date(invoice.dueOn)}`, 50, 263);
      const y = 305;
      doc.fillColor(GREEN).rect(50, y, 495, 28).fill();
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9).text('DESCRIPTION', 62, y + 10);
      doc.text('MONTANT', 430, y + 10, { width: 103, align: 'right' });
      doc.fillColor(INK).font('Helvetica').fontSize(10).text(invoice.description || 'Prestations et services', 62, y + 44, { width: 335 });
      doc.font('Helvetica-Bold').text(this.money(invoice.amountCdf), 430, y + 44, { width: 103, align: 'right' });
      doc.strokeColor(LINE).moveTo(50, y + 70).lineTo(545, y + 70).stroke();
      this.totals(doc, invoice.amountCdf, 0, invoice.amountCdf, 0, y + 95);
      doc.fillColor(MUTE).font('Helvetica').fontSize(9).text(`Montant paye : ${this.money(invoice.paidAmountCdf)}`, 50, y + 178);
      doc.text(`Solde : ${this.money(Math.max(0, invoice.amountCdf - invoice.paidAmountCdf))}`, 50, y + 194);
      this.footer(doc, invoice.number);
    });
  }

  private build(draw: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Author: 'Nola Studio' } });
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
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(25).text('NOLA', 50, 42, { continued: true });
    doc.fillColor(OCRE).text(' STUDIO');
    doc.fillColor('#FFFFFF').font('Helvetica').fontSize(9).text('Solutions numériques et accompagnement business', 50, 76);
    doc.font('Helvetica-Bold').fontSize(22).text(kind, 390, 39, { width: 155, align: 'right' });
    doc.font('Helvetica').fontSize(9).text(number, 390, 71, { width: 155, align: 'right' });
    doc.text(this.date(date), 390, 87, { width: 155, align: 'right' });
  }

  private parties(doc: PDFKit.PDFDocument, name: string, email?: string | null, phone?: string | null) {
    doc.fillColor(MUTE).font('Helvetica-Bold').fontSize(8).text('ADRESSE A', 50, 172);
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
      doc.text(this.money(line.unitPriceCdf), 360, y + 6, { width: 80, align: 'right' });
      doc.font('Helvetica-Bold').text(this.money(line.totalCdf), 450, y + 6, { width: 83, align: 'right' });
      doc.strokeColor(LINE).moveTo(50, y + rowHeight).lineTo(545, y + rowHeight).stroke();
      y += rowHeight;
    }
    this.totals(doc, quote.subtotalCdf, quote.taxCdf, quote.totalCdf, quote.taxRate, y + 18);
  }

  private totals(doc: PDFKit.PDFDocument, subtotal: number, tax: number, total: number, taxRate: number, y = 520) {
    doc.fillColor(MUTE).font('Helvetica').fontSize(9).text('Sous-total', 350, y, { width: 90 });
    doc.fillColor(INK).text(this.money(subtotal), 450, y, { width: 83, align: 'right' });
    doc.fillColor(MUTE).text(`Taxe (${taxRate}%)`, 350, y + 19, { width: 90 });
    doc.fillColor(INK).text(this.money(tax), 450, y + 19, { width: 83, align: 'right' });
    doc.fillColor(GREEN).rect(340, y + 42, 205, 34).fill();
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10).text('TOTAL', 352, y + 54);
    doc.text(this.money(total), 435, y + 54, { width: 98, align: 'right' });
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
    doc.fillColor(MUTE).font('Helvetica').fontSize(7).text('Nola Studio  |  Merci pour votre confiance', 50, bottom, { width: 350, lineBreak: false });
    doc.text(reference, 400, bottom, { width: 145, align: 'right', lineBreak: false });
  }

  private money(value: number) {
    return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value).replace(/[\u202f\u00a0]/g, ' ')} CDF`;
  }

  private date(value: string) {
    return new Intl.DateTimeFormat('fr-CA', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
  }
}
