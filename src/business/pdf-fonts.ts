import * as path from 'node:path';

/** PostScript keys, matching design/pdf-layout.md §5 exactly. */
export const PDF_FONTS = {
  regular: 'PJS-Regular',
  semibold: 'PJS-SemiBold',
  bold: 'PJS-Bold',
  extrabold: 'PJS-ExtraBold',
  italic: 'PJS-Italic',
  mono: 'SpaceMono-Regular',
  monoBold: 'SpaceMono-Bold',
} as const;

const FONT_DIR = path.join(__dirname, 'assets/fonts');

const FONT_FILES: Record<(typeof PDF_FONTS)[keyof typeof PDF_FONTS], string> = {
  [PDF_FONTS.regular]: 'PlusJakartaSans-Regular.ttf',
  [PDF_FONTS.semibold]: 'PlusJakartaSans-SemiBold.ttf',
  [PDF_FONTS.bold]: 'PlusJakartaSans-Bold.ttf',
  [PDF_FONTS.extrabold]: 'PlusJakartaSans-ExtraBold.ttf',
  [PDF_FONTS.italic]: 'PlusJakartaSans-Italic.ttf',
  [PDF_FONTS.mono]: 'SpaceMono-Regular.ttf',
  [PDF_FONTS.monoBold]: 'SpaceMono-Bold.ttf',
};

/** Must run once per document before any `.font(PDF_FONTS.x)` call — PDFKit's built-in Helvetica aliases don't apply once a custom font has been registered under a different name. */
export function registerPdfFonts(doc: PDFKit.PDFDocument): void {
  for (const [name, file] of Object.entries(FONT_FILES)) {
    doc.registerFont(name, path.join(FONT_DIR, file));
  }
}
