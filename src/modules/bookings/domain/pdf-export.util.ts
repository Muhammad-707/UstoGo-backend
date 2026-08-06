/**
 * Dependency-free, single-page, text-only PDF writer (CLAUDE.md §5 — no new
 * dependency for a handful of receipt lines). Hand-writes the minimal PDF 1.4
 * object graph a viewer needs: Catalog → Pages → Page → Font, plus one content
 * stream of `Tj`/`Td` text operators. Byte offsets for the xref table are computed
 * from the objects actually written, never hand-counted.
 *
 * Known limitation, accepted rather than solved here: the standard 14 PDF fonts
 * (Helvetica included) only cover Latin-1-ish text. A Cyrillic client/master name
 * renders as missing glyphs. Embedding a Unicode font is real scope beyond a receipt
 * — revisit if this becomes the primary receipt format rather than a convenience export.
 */

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT_MARGIN = 50;
const TOP_MARGIN = 740;
const LINE_HEIGHT = 20;
const FONT_SIZE = 12;

/** PDF string literals escape backslash and parentheses (PDF spec §7.3.4.2). */
const escapePdfText = (text: string): string =>
  text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

const buildContentStream = (lines: readonly string[]): string => {
  const body = lines
    .map((line, index) => {
      const positioning = index === 0 ? `${LEFT_MARGIN} ${TOP_MARGIN} Td` : `0 -${LINE_HEIGHT} Td`;
      return `${positioning}\n(${escapePdfText(line)}) Tj`;
    })
    .join('\n');

  return `BT\n/F1 ${FONT_SIZE} Tf\n${body}\nET`;
};

export const buildReceiptPdf = (lines: readonly string[]): Buffer => {
  const content = buildContentStream(lines);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      '/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${String(Buffer.byteLength(content, 'utf8'))} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const [index, body] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${String(index + 1)} 0 obj\n${body}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  const xrefEntries = offsets
    .slice(1)
    .map((offset) => `${offset.toString().padStart(10, '0')} 00000 n \n`)
    .join('');

  pdf +=
    `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n${xrefEntries}` +
    `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\n` +
    `startxref\n${String(xrefOffset)}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
};
