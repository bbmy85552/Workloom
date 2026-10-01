import TurndownService from 'turndown';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error html-to-docx no types
import htmlToDocxLib from 'html-to-docx';
import ExcelJS from 'exceljs';
import { normalizeFilename } from './filename.js';

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html || '');
}

export async function htmlToDocx(html: string, title?: string, origin?: string): Promise<Buffer> {
  // html-to-docx 库对部分 HTML 结构会崩溃，需在转换前清洗：
  //  1) 自闭合 <img>（无 </img>）→ buildParagraph null 解引用；且无法处理相对路径图片。
  //     处理：补闭合标签 + 相对 src 补全为绝对 URL。
  //  2) table/col/colgroup/th/td 的 inline style（百分比宽度等）→ buildTableCellWidth
  //     生成非法 XML 名称（Invalid XML name: @w）。处理：剥离这些元素的 style 属性（docx 用默认布局）。
  let safe = html || '<p></p>';
  if (origin) {
    safe = safe.replace(/(<img[^>]*?)\ssrc="\/(?!\/)/gi, `$1 src="${origin}/`);
  }
  safe = safe.replace(/<img([^>]*?)\/?>/gi, '<img$1></img>');
  safe = safe.replace(
    /(<(?:table|colgroup|col|thead|tbody|tfoot|tr|th|td)\b[^>]*?)\sstyle="[^"]*"/gi,
    '$1',
  );
  const wrapped = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title || '文档')}</title></head><body>${safe}</body></html>`;
  const buffer = (await htmlToDocxLib(wrapped, undefined, {
    table: { row: { cantSplit: true } },
    footer: false,
    pageNumber: false,
  })) as Buffer | ArrayBuffer | Uint8Array;
  if (buffer instanceof Buffer) return buffer;
  return Buffer.from(buffer as ArrayBuffer);
}

export function htmlToFullPage(html: string, title?: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title || '文档')}</title>
  <style>
    body { font-family: -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif; max-width: 720px; margin: 32px auto; padding: 0 24px; line-height: 1.75; color: #1b1b1d; }
    h1, h2, h3 { font-family: Georgia, "Source Serif 4", serif; }
    img { max-width: 100%; border-radius: 6px; }
    table { border-collapse: collapse; }
    table td, table th { border: 1px solid #ddd; padding: 6px 10px; }
    pre { background: #1b1b1d; color: #f1f1f3; padding: 12px 16px; border-radius: 8px; overflow-x: auto; }
    blockquote { border-left: 3px solid #5e5ce6; padding-left: 1em; color: #555; }
  </style>
</head>
<body>
${html || ''}
</body>
</html>`;
}

interface ExcelInput {
  name: string;
  fields: { name: string; type: string }[];
  records: { data: Record<string, unknown> }[];
}

export async function tableToCsv(input: ExcelInput): Promise<string> {
  const headers = input.fields.map((f) => csvEscape(f.name)).join(',');
  const rows = input.records.map((r) =>
    input.fields
      .map((f) => csvEscape(normalizeCell(r.data[f.name])))
      .join(','),
  );
  return `${headers}\n${rows.join('\n')}\n`;
}

export async function tableToXlsx(input: ExcelInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(input.name.slice(0, 28) || 'Sheet1');
  ws.columns = input.fields.map((f) => ({ header: f.name, key: f.name, width: 18 }));
  for (const r of input.records) {
    const row: Record<string, unknown> = {};
    for (const f of input.fields) row[f.name] = normalizeCell(r.data[f.name]);
    ws.addRow(row);
  }
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function normalizeCell(v: unknown): string | number | boolean | Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        if (x && typeof x === 'object' && 'originalName' in (x as Record<string, unknown>)) {
          return normalizeFilename((x as { originalName: string }).originalName);
        }
        return String(x);
      })
      .join(', ');
  }
  if (typeof v === 'object') {
    if ('originalName' in (v as Record<string, unknown>)) {
      return normalizeFilename((v as { originalName: string }).originalName);
    }
    return JSON.stringify(v);
  }
  return String(v);
}

function csvEscape(v: string | number | boolean | Date | null): string {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
