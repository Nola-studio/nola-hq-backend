import type { PdfTheme } from './pdf-themes';
import { PDF_NEUTRALS } from './pdf-themes';
import { PDF_FONTS } from './pdf-fonts';

type Doc = PDFKit.PDFDocument;

/** Content column: X:50→545, 495pt wide. Every primitive below is transcribed from design/pdf-layout.md — not re-derived from the HTML references. */
export const PAGE = { width: 595, height: 842, margin: 50, contentWidth: 495, contentRight: 545 };

// ── Generic building blocks ─────────────────────────────────────────

/**
 * Single-line text that never wraps. Confirmed empirically (render + visual
 * inspection) that PDFKit 0.19's `lineBreak: false` does NOT suppress
 * width-based wrapping when a `width` is also passed — text still breaks at
 * word boundaries, which silently corrupted every fixed-height row in this
 * design (a wrapped label pushes into the row below it, which was drawn at
 * a Y computed as if the label were one line). Omitting `width` entirely is
 * the only way to force one line in this version. This measures the text
 * and positions it manually instead, so a too-long string overflows
 * visually (like CSS `white-space: nowrap`) rather than wrapping.
 */
export function fitText(
  doc: Doc,
  text: string,
  x: number,
  y: number,
  width: number,
  opts: { align?: 'left' | 'center' | 'right'; characterSpacing?: number } = {},
): void {
  const textWidth = doc.widthOfString(text, { characterSpacing: opts.characterSpacing });
  let drawX = x;
  if (opts.align === 'right') drawX = x + Math.max(width - textWidth, 0);
  else if (opts.align === 'center') drawX = x + Math.max((width - textWidth) / 2, 0);
  doc.text(text, drawX, y, { lineBreak: false, characterSpacing: opts.characterSpacing });
}

/** Rounded rect, optionally filled/stroked/dashed. The one shape primitive every card-like element in the design reduces to. */
export function roundedCard(
  doc: Doc,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  opts: { fill?: string; stroke?: string; dash?: boolean } = {},
): void {
  if (opts.dash) doc.dash(3, { space: 2 });
  doc.roundedRect(x, y, w, h, radius);
  if (opts.fill && opts.stroke) doc.fillAndStroke(opts.fill, opts.stroke);
  else if (opts.fill) doc.fill(opts.fill);
  else if (opts.stroke) doc.stroke(opts.stroke);
  if (opts.dash) doc.undash();
}

/** Fully-rounded capsule badge, e.g. "● Envoyée". A drawn dot, not a "●" (U+25CF) text character — confirmed absent from the vendored Plus Jakarta Sans/Space Mono glyph sets via fontTools' cmap (present in none of the 7 weights). Returns the rendered width. */
export function statusPill(doc: Doc, x: number, y: number, label: string, colors: { bg: string; text: string }): number {
  const text = label.toUpperCase();
  doc.font(PDF_FONTS.semibold).fontSize(9);
  const textWidth = doc.widthOfString(text, { characterSpacing: 0.4 });
  const paddingX = 7;
  const dotRadius = 2.5;
  const dotGap = 5;
  const height = 13;
  const width = textWidth + paddingX * 2 + dotRadius * 2 + dotGap;
  doc.roundedRect(x, y, width, height, height / 2).fill(colors.bg);
  const dotCx = x + paddingX + dotRadius;
  const dotCy = y + height / 2;
  doc.circle(dotCx, dotCy, dotRadius).fill(colors.text);
  doc.fillColor(colors.text);
  fitText(doc, text, dotCx + dotRadius + dotGap, y + 3, width, { characterSpacing: 0.4 });
  return width;
}

/** Small rectangular chip (distinct from statusPill's full capsule) — used for the header's document-type badge. */
export function chip(doc: Doc, x: number, y: number, label: string, colors: { bg: string; text: string }, radius = 4): number {
  doc.font(PDF_FONTS.bold).fontSize(9);
  const textWidth = doc.widthOfString(label, { characterSpacing: 1 });
  const paddingX = 7;
  const height = 15;
  const width = textWidth + paddingX * 2;
  doc.roundedRect(x, y, width, height, radius).fill(colors.bg);
  doc.fillColor(colors.text);
  fitText(doc, label, x + paddingX, y + 4, width - paddingX * 2, { characterSpacing: 1 });
  return width;
}

/** Computes column X offsets from a starting X, a width array, and a gap — the "column widths, not one hardcoded layout" primitive. [125,170,170] @ gap 15 from X=50 → [50,190,375] (receipt); [240,240] @ gap 15 from X=50 → [50,305] (invoice/quote). */
export function columns(startX: number, widths: number[], gap: number): number[] {
  const xs: number[] = [];
  let x = startX;
  for (const w of widths) {
    xs.push(x);
    x += w + gap;
  }
  return xs;
}

export interface KeyValueRow {
  label: string;
  value: string;
  mono?: boolean;
  color?: string;
}

/** Label-left / value-right stacked rows — meta-card-2's date/facture/statut block, and the totals breakdown. Both sides are single-line (`fitText`) — a label that's too long for its column overflows visually rather than wrapping into the row below. Returns the Y just past the last row. */
export function keyValueList(doc: Doc, x: number, y: number, width: number, rows: KeyValueRow[], lineHeight = 15): number {
  let cursorY = y;
  const gap = 4;
  const labelWidth = width * 0.52;
  const valueWidth = width - labelWidth - gap;
  for (const r of rows) {
    doc.font(PDF_FONTS.regular).fontSize(10.5).fillColor(PDF_NEUTRALS.textMuted);
    fitText(doc, r.label, x, cursorY, labelWidth);
    doc.font(r.mono ? PDF_FONTS.mono : PDF_FONTS.semibold).fontSize(r.mono ? 9.5 : 10.5).fillColor(r.color ?? PDF_NEUTRALS.textMain);
    fitText(doc, r.value, x + labelWidth + gap, cursorY, valueWidth, { align: 'right' });
    cursorY += lineHeight;
  }
  return cursorY;
}

export interface ItemRow {
  description: string;
  sub?: string;
  qty: string;
  unitPrice: string;
  total: string;
}

export interface ItemsTableColumns {
  descWidth: number;
  qtyWidth: number;
  unitWidth: number;
  totalWidth: number;
  descLabel: string;
  qtyLabel: string;
  unitLabel: string;
  totalLabel: string;
}

/** Outer rounded border (`doc.roundedRect(50, 200, 495, h, 8)` per §2) — stroked once the table's total height is known, after the header + all rows are drawn, so the border encloses dynamic content rather than needing it pre-computed. Stroke-only, drawn last so it sits on top of the content's edges without covering the inset cell padding. */
export function itemsTableContainer(doc: Doc, x: number, y: number, width: number, height: number): void {
  doc.roundedRect(x, y, width, height, 8).stroke(PDF_NEUTRALS.border);
}

/** Desc 245 | Qté 40 | PU 105 | Total 105 = 495pt, per design/pdf-layout.md §2. Same shape for quote/invoice/receipt — only header labels differ. Draws the header band only; row-by-row drawing (and pagination) is `itemsTableRow`, kept separate so pagination logic can wrap it without touching header drawing. */
export function itemsTableHeader(doc: Doc, x: number, y: number, cols: ItemsTableColumns): number {
  const width = cols.descWidth + cols.qtyWidth + cols.unitWidth + cols.totalWidth;
  // Clip the header's fill to the container's top corner radius (8pt) so a flat rect
  // doesn't poke past the rounded outer border drawn later by `itemsTableContainer`.
  doc.save();
  doc.roundedRect(x, y, width, 34, 8).clip();
  doc.rect(x, y, width, 26).fill(PDF_NEUTRALS.backgroundCard);
  doc.restore();
  doc.font(PDF_FONTS.semibold).fontSize(9).fillColor(PDF_NEUTRALS.textMuted);
  let cx = x;
  fitText(doc, cols.descLabel.toUpperCase(), cx + 10, y + 9, cols.descWidth - 10, { characterSpacing: 0.4 });
  cx += cols.descWidth;
  fitText(doc, cols.qtyLabel.toUpperCase(), cx, y + 9, cols.qtyWidth, { align: 'center', characterSpacing: 0.4 });
  cx += cols.qtyWidth;
  fitText(doc, cols.unitLabel.toUpperCase(), cx, y + 9, cols.unitWidth - 10, { align: 'right', characterSpacing: 0.4 });
  cx += cols.unitWidth;
  fitText(doc, cols.totalLabel.toUpperCase(), cx, y + 9, cols.totalWidth - 10, { align: 'right', characterSpacing: 0.4 });
  return y + 26;
}

/** Measures a row's height without drawing it — lets a paginating caller decide whether the row fits on the current page before committing to draw it. */
export function itemRowHeight(doc: Doc, cols: ItemsTableColumns, item: ItemRow): number {
  const subLines = item.sub ? doc.font(PDF_FONTS.regular).fontSize(9.5).heightOfString(item.sub, { width: cols.descWidth - 20 }) : 0;
  return Math.max(30, 14 + subLines + 8);
}

/** One item row. Returns the row's height so the caller can advance its cursor (and, in the pagination-aware caller, decide whether to break). Description is single-line (`fitText`); `sub` is intentionally the one field allowed to wrap (its rendered height is measured beforehand and folded into rowHeight via `itemRowHeight`). */
export function itemsTableRow(doc: Doc, x: number, y: number, cols: ItemsTableColumns, item: ItemRow): number {
  const width = cols.descWidth + cols.qtyWidth + cols.unitWidth + cols.totalWidth;
  const rowHeight = itemRowHeight(doc, cols, item);

  doc.font(PDF_FONTS.semibold).fontSize(11).fillColor(PDF_NEUTRALS.textMain);
  fitText(doc, item.description, x + 10, y + 8, cols.descWidth - 20);
  if (item.sub) {
    doc.font(PDF_FONTS.regular).fontSize(9.5).fillColor(PDF_NEUTRALS.textMuted).text(item.sub, x + 10, y + 21, { width: cols.descWidth - 20 });
  }
  let cx = x + cols.descWidth;
  doc.font(PDF_FONTS.semibold).fontSize(11).fillColor(PDF_NEUTRALS.textMain);
  fitText(doc, item.qty, cx, y + rowHeight / 2 - 5.5, cols.qtyWidth, { align: 'center' });
  cx += cols.qtyWidth;
  doc.font(PDF_FONTS.mono).fontSize(10.5);
  fitText(doc, item.unitPrice, cx, y + rowHeight / 2 - 5, cols.unitWidth - 10, { align: 'right' });
  cx += cols.unitWidth;
  doc.font(PDF_FONTS.monoBold).fontSize(10.5);
  fitText(doc, item.total, cx, y + rowHeight / 2 - 5, cols.totalWidth - 10, { align: 'right' });

  doc.moveTo(x, y + rowHeight).lineTo(x + width, y + rowHeight).strokeColor(PDF_NEUTRALS.border).stroke();
  return rowHeight;
}

export interface TotalsBlockSpec {
  x: number;
  y: number;
  width: number;
  rows: KeyValueRow[];
  grandLabel: string;
  grandValue: string;
  wordsLine?: string;
  theme: PdfTheme;
}

/** Totals breakdown + filled grand-total card + amount-in-words. Receipt passes 3 rows (with a highlighted "reste à payer") and label "Montant Payé"; invoice/quote passes 2 rows and label "Net à Payer" — same primitive, different row arrays. Returns the Y past the words line. */
export function totalsBlock(doc: Doc, spec: TotalsBlockSpec): number {
  const afterRows = keyValueList(doc, spec.x, spec.y, spec.width, spec.rows);
  const grandY = afterRows + 6;
  roundedCard(doc, spec.x, grandY, spec.width, 38, 6, { fill: spec.theme.primary });
  doc.font(PDF_FONTS.semibold).fontSize(10.5).fillColor('#FFFFFF');
  fitText(doc, spec.grandLabel, spec.x + 12, grandY + 13, spec.width - 12);
  doc.font(PDF_FONTS.monoBold).fontSize(14.5);
  fitText(doc, spec.grandValue, spec.x, grandY + 11, spec.width - 12, { align: 'right' });
  let cursorY = grandY + 38;
  if (spec.wordsLine) {
    cursorY += 4;
    doc.font(PDF_FONTS.italic).fontSize(9.5).fillColor(PDF_NEUTRALS.textMuted).text(spec.wordsLine, spec.x, cursorY, { width: spec.width, align: 'right' });
    cursorY += doc.heightOfString(spec.wordsLine, { width: spec.width, align: 'right' });
  }
  return cursorY;
}

export interface PaymentBoxSpec {
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  pills: Array<{ label: string; bg: string; text: string; mono?: boolean }>;
  bodyText?: string;
}

/** Dashed rounded box: title + badge pills + free text (payment terms / legal notice). Omit `bodyText`/`pills` entirely rather than inventing content — see invoice()'s payment box, which is deliberately empty. */
export function paymentBox(doc: Doc, spec: PaymentBoxSpec): void {
  roundedCard(doc, spec.x, spec.y, spec.width, spec.height, 8, { stroke: PDF_NEUTRALS.borderFocus, dash: true, fill: PDF_NEUTRALS.paymentBoxBg });
  doc.font(PDF_FONTS.semibold).fontSize(9).fillColor(PDF_NEUTRALS.textMuted).text(spec.title.toUpperCase(), spec.x + 12, spec.y + 10, { width: spec.width - 24, characterSpacing: 0.4 });
  let cx = spec.x + 12;
  const pillY = spec.y + 24;
  for (const pill of spec.pills) {
    doc.font(pill.mono ? PDF_FONTS.mono : PDF_FONTS.semibold).fontSize(pill.mono ? 9 : 10);
    const textWidth = doc.widthOfString(pill.label);
    const w = textWidth + 12;
    doc.roundedRect(cx, pillY, w, 16, 4).fill(pill.bg);
    doc.fillColor(pill.text);
    fitText(doc, pill.label, cx + 6, pillY + 4, w - 12);
    cx += w + 6;
  }
  if (spec.bodyText) {
    doc.font(PDF_FONTS.regular).fontSize(9.5).fillColor(PDF_NEUTRALS.textMuted).text(spec.bodyText, spec.x + 12, pillY + 26, { width: spec.width - 24, lineGap: 2 });
  }
}

export interface SignatureCard {
  width: number;
  kind: 'qr' | 'stamp';
  /** kind: 'qr' */
  qrImage?: Buffer;
  qrCaption?: string;
  qrToken?: string;
  /** kind: 'stamp' */
  stampLabel?: string;
  caption: string;
}

/**
 * Signature/verification row. Takes an explicit width array (via `columns`)
 * rather than a hardcoded layout — the receipt passes [125,170,170]
 * (QR + 2 signatures), invoice/quote passes [240,240] (2 signatures only,
 * no verification endpoint exists for them). One function, two shapes.
 */
export function signatureBlock(doc: Doc, y: number, cards: SignatureCard[], gap = 15): void {
  const xs = columns(PAGE.margin, cards.map((c) => c.width), gap);
  cards.forEach((card, i) => {
    const x = xs[i];
    if (card.kind === 'qr' && card.qrImage) {
      roundedCard(doc, x, y, card.width, 90, 8, { fill: PDF_NEUTRALS.backgroundCard, stroke: PDF_NEUTRALS.border });
      const qrSize = 50;
      doc.image(card.qrImage, x + (card.width - qrSize) / 2, y + 8, { width: qrSize, height: qrSize });
      doc.font(PDF_FONTS.regular).fontSize(8).fillColor(PDF_NEUTRALS.textMuted);
      fitText(doc, card.qrCaption ?? '', x, y + 62, card.width, { align: 'center' });
      doc.font(PDF_FONTS.monoBold).fontSize(8.5).fillColor(PDF_NEUTRALS.textMain);
      fitText(doc, card.qrToken ?? '', x, y + 74, card.width, { align: 'center' });
    } else {
      doc.font(PDF_FONTS.regular).fontSize(8.5).fillColor(PDF_NEUTRALS.textLight);
      const stampLabel = card.stampLabel ?? '';
      const stampWidth = doc.widthOfString(stampLabel) + 20;
      const stampX = x + (card.width - stampWidth) / 2;
      roundedCard(doc, stampX, y + 24, stampWidth, 18, 4, { stroke: PDF_NEUTRALS.borderFocus, dash: true });
      fitText(doc, stampLabel, stampX, y + 29, stampWidth, { align: 'center' });
      doc.moveTo(x, y + 66).lineTo(x + card.width, y + 66).strokeColor(PDF_NEUTRALS.borderFocus).stroke();
      doc.font(PDF_FONTS.bold).fontSize(8.5).fillColor(PDF_NEUTRALS.textMuted);
      fitText(doc, card.caption.toUpperCase(), x, y + 71, card.width, { align: 'center', characterSpacing: 0.5 });
    }
  });
}

export interface HeaderSpec {
  monogram: string;
  brandName: string;
  brandSub: string;
  badge: string;
  title: string;
  number: string;
  theme: PdfTheme;
}

/** Logo box + brand name/sub (left, 315pt) and badge chip + title + number (right, 180pt, right-aligned), per design/pdf-layout.md §2. No date here — both references moved the date into meta-card-2's key-value block. */
export function header(doc: Doc, spec: HeaderSpec): void {
  roundedCard(doc, 50, 50, 40, 40, 8, { fill: spec.theme.primary });
  doc.font(PDF_FONTS.extrabold).fontSize(20).fillColor('#FFFFFF');
  fitText(doc, spec.monogram, 50, 63, 40, { align: 'center' });

  doc.font(PDF_FONTS.bold).fontSize(16).fillColor(PDF_NEUTRALS.textMain);
  fitText(doc, spec.brandName, 102, 52, 263);
  doc.font(PDF_FONTS.regular).fontSize(10.5).fillColor(PDF_NEUTRALS.textMuted);
  fitText(doc, spec.brandSub, 102, 71, 263);

  chip(doc, 545 - chipWidth(doc, spec.badge), 50, spec.badge.toUpperCase(), { bg: spec.theme.primaryLight, text: spec.theme.primary });
  doc.font(PDF_FONTS.bold).fontSize(15).fillColor(PDF_NEUTRALS.textMain);
  fitText(doc, spec.title, 365, 68, 180, { align: 'right' });
  doc.font(PDF_FONTS.mono).fontSize(10.5).fillColor(PDF_NEUTRALS.textMuted);
  fitText(doc, spec.number, 365, 86, 180, { align: 'right' });

  doc.moveTo(50, 98).lineTo(545, 98).strokeColor(PDF_NEUTRALS.border).stroke();
}

/** Measures a chip's rendered width without drawing it, so the header badge can be right-aligned to X=545 without a layout pass. */
function chipWidth(doc: Doc, label: string): number {
  doc.font(PDF_FONTS.bold).fontSize(9);
  return doc.widthOfString(label, { characterSpacing: 1 }) + 14;
}

export interface MetaCardsSpec {
  card1Label: string;
  card1Name: string;
  card1Detail: string;
  card2Label: string;
  card2Rows: KeyValueRow[];
  card2StatusPill?: { label: string; theme: PdfTheme };
}

/** Card1 285pt (client/payer identity) + 15pt gap + Card2 195pt (document meta), Y=108 H=80, per §2. */
export function metaCards(doc: Doc, y: number, spec: MetaCardsSpec): void {
  const [x1, x2] = columns(50, [285, 195], 15);

  roundedCard(doc, x1, y, 285, 80, 8, { fill: PDF_NEUTRALS.backgroundCard, stroke: PDF_NEUTRALS.border });
  doc.font(PDF_FONTS.semibold).fontSize(9).fillColor(PDF_NEUTRALS.textMuted).text(spec.card1Label.toUpperCase(), x1 + 12, y + 10, { width: 261, characterSpacing: 0.4 });
  doc.font(PDF_FONTS.bold).fontSize(13.5).fillColor(PDF_NEUTRALS.textMain);
  fitText(doc, spec.card1Name, x1 + 12, y + 26, 261);
  doc.font(PDF_FONTS.regular).fontSize(10.5).fillColor(PDF_NEUTRALS.textMuted).text(spec.card1Detail, x1 + 12, y + 46, { width: 261 });

  roundedCard(doc, x2, y, 195, 80, 8, { fill: PDF_NEUTRALS.backgroundCard, stroke: PDF_NEUTRALS.border });
  doc.font(PDF_FONTS.semibold).fontSize(9).fillColor(PDF_NEUTRALS.textMuted).text(spec.card2Label.toUpperCase(), x2 + 12, y + 10, { width: 171, characterSpacing: 0.4 });
  const rows = spec.card2StatusPill ? spec.card2Rows.slice(0, -1) : spec.card2Rows;
  const afterY = keyValueList(doc, x2 + 12, y + 27, 171, rows, 14);
  if (spec.card2StatusPill) {
    const lastLabel = spec.card2Rows[spec.card2Rows.length - 1]?.label ?? '';
    doc.font(PDF_FONTS.regular).fontSize(9).fillColor(PDF_NEUTRALS.textMuted);
    fitText(doc, lastLabel, x2 + 12, afterY + 1, 80);
    statusPill(doc, x2 + 12 + 80, afterY - 2, spec.card2StatusPill.label, { bg: spec.card2StatusPill.theme.badgeBg, text: spec.card2StatusPill.theme.badgeText });
  }
}

export interface FooterSpec {
  brandLine: string;
  monogram: string;
  theme: PdfTheme;
  rightText: string;
}

/** Brand line (left, 300pt) + "Nolaa Studio Inc." (right, 195pt) per the footer constraint — renders on the last page only; other pages get `pageNumberStamp` instead. */
export function footer(doc: Doc, y: number, spec: FooterSpec): void {
  doc.moveTo(50, y).lineTo(545, y).strokeColor(PDF_NEUTRALS.border).stroke();
  const textY = y + 7;
  const tagSize = 13;
  doc.roundedRect(50, textY - 1, tagSize, tagSize, 2).fill(spec.theme.primary);
  doc.font(PDF_FONTS.bold).fontSize(7.5).fillColor('#FFFFFF');
  fitText(doc, spec.monogram, 50, textY + 2, tagSize, { align: 'center' });
  doc.font(PDF_FONTS.regular).fontSize(9.5).fillColor(PDF_NEUTRALS.textMuted);
  fitText(doc, spec.brandLine, 50 + tagSize + 5, textY, 300 - tagSize - 5);
  fitText(doc, spec.rightText, 350, textY, 195, { align: 'right' });
}

/** Continuation-page stand-in for the footer, per the "footer on last page only" rule — bottom-right, small. */
export function pageNumberStamp(doc: Doc, page: number, totalPages: number): void {
  doc.font(PDF_FONTS.mono).fontSize(8).fillColor(PDF_NEUTRALS.textLight);
  fitText(doc, `Page ${page} / ${totalPages}`, 445, PAGE.height - 40, 100, { align: 'right' });
}

/** X=0,Y=0,W=595,H=5, gradient primary→accent, per §2. */
export function topAccentBar(doc: Doc, theme: PdfTheme): void {
  const gradient = doc.linearGradient(0, 0, PAGE.width, 0);
  gradient.stop(0, theme.primary).stop(1, theme.accent);
  doc.rect(0, 0, PAGE.width, 5).fill(gradient);
}
