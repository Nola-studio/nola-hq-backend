import { readFileSync } from 'fs';
import { inflateRawSync } from 'zlib';

/**
 * Minimal, dependency-free .xlsx reader — just enough to pull cell values
 * out of specific worksheets. Deliberately not a general library: no
 * styles, no formulas beyond their cached `<v>` result, no charts/drawings.
 *
 * Why hand-rolled instead of a package: the only maintained xlsx parser on
 * npm (`xlsx`/SheetJS) carries two unpatched high-severity advisories
 * (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9) at the version npm serves. For
 * a one-off script run once against a single trusted local file, a ~150
 * line reader using only Node's built-in `zlib` is the safer choice.
 *
 * .xlsx is a ZIP of XML parts. This implements just enough of the ZIP
 * central-directory format to locate and inflate the parts we need.
 */

interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
}

function readZipEntries(buf: Buffer): Map<string, ZipEntry> {
  // End Of Central Directory record: scan back from the end for its signature.
  const EOCD_SIG = 0x06054b50;
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('Not a valid .xlsx (ZIP EOCD record not found)');

  const entryCount = buf.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries = new Map<string, ZipEntry>();
  let offset = centralDirOffset;
  const CENTRAL_SIG = 0x02014b50;
  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(offset) !== CENTRAL_SIG) {
      throw new Error(`Malformed ZIP central directory entry at offset ${offset}`);
    }
    const compressionMethod = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLength);

    entries.set(name, { name, compressionMethod, compressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipEntryData(buf: Buffer, entry: ZipEntry): Buffer {
  const LOCAL_SIG = 0x04034b50;
  const offset = entry.localHeaderOffset;
  if (buf.readUInt32LE(offset) !== LOCAL_SIG) {
    throw new Error(`Malformed ZIP local header for ${entry.name}`);
  }
  const nameLength = buf.readUInt16LE(offset + 26);
  const extraLength = buf.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + nameLength + extraLength;
  const compressed = buf.subarray(dataStart, dataStart + entry.compressedSize);
  return entry.compressionMethod === 0 ? Buffer.from(compressed) : inflateRawSync(compressed);
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseSharedStrings(xml: string): string[] {
  const sst: string[] = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let tm: RegExpExecArray | null;
    let text = '';
    while ((tm = tRe.exec(m[1]))) text += tm[1];
    sst.push(decodeXmlEntities(text));
  }
  return sst;
}

function colToIndex(col: string): number {
  let idx = 0;
  for (let i = 0; i < col.length; i++) idx = idx * 26 + (col.charCodeAt(i) - 64);
  return idx - 1;
}

/** One parsed worksheet: `rows[rowNumber][colIndex] = cell value`, 1-indexed rows, 0-indexed columns. */
export type SheetRows = Array<Array<string | number | boolean | null> | undefined>;

function parseSheet(xml: string, sst: string[]): SheetRows {
  const rows: SheetRows = [];
  const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const rowNum = parseInt(rm[1], 10);
    const rowXml = rm[2];
    const cellRe = /<c r="([A-Z]+)(\d+)"([^\/>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    const row: Array<string | number | boolean | null> = [];
    while ((cm = cellRe.exec(rowXml))) {
      const col = cm[1];
      const attrs = cm[3] || '';
      const inner = cm[4] || '';
      const typeMatch = attrs.match(/t="([^"]+)"/);
      const type = typeMatch ? typeMatch[1] : null;
      const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
      const vRaw = vMatch ? vMatch[1] : null;

      let value: string | number | boolean | null = null;
      if (type === 's') {
        value = vRaw !== null ? sst[parseInt(vRaw, 10)] ?? '' : '';
      } else if (type === 'str') {
        value = vRaw !== null ? decodeXmlEntities(vRaw) : '';
      } else if (type === 'inlineStr') {
        const isMatch = inner.match(/<is>([\s\S]*?)<\/is>/);
        let text = '';
        if (isMatch) {
          const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
          let tm2: RegExpExecArray | null;
          while ((tm2 = tRe.exec(isMatch[1]))) text += tm2[1];
        }
        value = decodeXmlEntities(text);
      } else if (type === 'b') {
        value = vRaw === '1';
      } else {
        value = vRaw !== null ? Number(vRaw) : null;
      }
      row[colToIndex(col)] = value;
    }
    rows[rowNum] = row;
  }
  return rows;
}

export interface Workbook {
  sheet(name: string): SheetRows;
}

const SHEET_FILES: Record<string, string> = {
  Dashboard: 'sheet1.xml',
  Projects: 'sheet2.xml',
  Tasks: 'sheet3.xml',
  Calc: 'sheet4.xml',
  Assignees: 'sheet5.xml',
  Domains: 'sheet6.xml',
  Billing: 'sheet7.xml',
  Recurring: 'sheet8.xml',
  Daily: 'sheet9.xml',
};

export function readWorkbook(path: string): Workbook {
  const buf = readFileSync(path);
  const entries = readZipEntries(buf);

  const sstEntry = entries.get('xl/sharedStrings.xml');
  const sst = sstEntry ? parseSharedStrings(readZipEntryData(buf, sstEntry).toString('utf8')) : [];

  const cache = new Map<string, SheetRows>();
  return {
    sheet(name: string): SheetRows {
      const cached = cache.get(name);
      if (cached) return cached;
      const file = SHEET_FILES[name];
      if (!file) throw new Error(`Unknown sheet "${name}"`);
      const entry = entries.get(`xl/worksheets/${file}`);
      if (!entry) throw new Error(`Sheet "${name}" not found in workbook`);
      const parsed = parseSheet(readZipEntryData(buf, entry).toString('utf8'), sst);
      cache.set(name, parsed);
      return parsed;
    },
  };
}

/** Excel's date epoch is 1899-12-30 (its serial-1900 system, off-by-two quirk included). */
export function excelSerialToIsoDate(serial: number): string {
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + serial * 86400000).toISOString().slice(0, 10);
}
