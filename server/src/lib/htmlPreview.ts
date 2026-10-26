import AdmZip from 'adm-zip';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../prisma.js';
import { HttpError } from './asyncHandler.js';
import { UPLOAD_ROOT } from './upload.js';

export const HTML_PREVIEW_ROOT = path.join(UPLOAD_ROOT, 'html-previews');

const MAX_FILES = 1000;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

const ALLOWED_EXTS = new Set([
  '.html', '.htm', '.css', '.js', '.mjs', '.json', '.map',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp3', '.mp4', '.webm', '.txt', '.xml',
]);

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

export function mimeFor(relPath: string): string {
  return MIME_MAP[path.posix.extname(relPath).toLowerCase()] || 'application/octet-stream';
}

export function previewDir(id: string): string {
  return path.join(HTML_PREVIEW_ROOT, id);
}

/** 校验 zip/单文件内的相对路径，返回规范化的 posix 相对路径；不合法返回 null。 */
export function sanitizeRel(raw: string): string | null {
  const rel = raw.replace(/\\/g, '/').replace(/^\.+\//, '');
  if (!rel || rel.includes('\0') || rel.startsWith('/') || /^[A-Za-z]:/.test(rel)) return null;
  const parts = rel.split('/');
  if (parts.some((p) => p === '..' || p === '')) return null;
  return parts.join('/');
}

function isSymlinkEntry(entry: AdmZip.IZipEntry): boolean {
  const attr = (entry.header as unknown as { attr?: number } | undefined)?.attr;
  if (typeof attr !== 'number') return false;
  return ((attr >>> 16) & 0o170000) === 0o120000;
}

export async function listPreviewFiles(dir: string): Promise<{ path: string; size: number }[]> {
  const out: { path: string; size: number }[] = [];
  async function walk(cur: string, prefix: string): Promise<void> {
    let items: fs.Dirent[];
    try {
      items = await fsp.readdir(cur, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isDirectory()) await walk(path.join(cur, item.name), rel);
      else if (item.isFile()) {
        const st = await fsp.stat(path.join(cur, item.name));
        out.push({ path: rel, size: st.size });
      }
    }
  }
  await walk(dir, '');
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

export function pickEntry(files: { path: string }[]): string | null {
  const lower = (p: string) => p.toLowerCase();
  const htmls = files.filter((f) => lower(f.path).endsWith('.html') || lower(f.path).endsWith('.htm'));
  if (htmls.length === 0) return null;
  for (const cand of ['index.html', 'index.htm']) {
    const hit = htmls.find((f) => lower(f.path) === cand);
    if (hit) return hit.path;
  }
  return htmls[0].path;
}

export interface ExtractResult {
  files: { path: string; size: number }[];
  entryPath: string;
  totalSize: number;
}

/**
 * 把上传内容解压/写入目标目录。单 .html 直接落盘；zip 解压并保留相对结构。
 * 拒绝：路径穿越、绝对路径、符号链接、白名单外扩展、超量文件、超大总体积。
 */
export async function extractUpload(
  buffer: Buffer,
  originalName: string,
  destDir: string,
  entryOverride?: string,
): Promise<ExtractResult> {
  await fsp.mkdir(destDir, { recursive: true });
  const ext = path.extname(originalName).toLowerCase();
  const written: { path: string; size: number }[] = [];
  let total = 0;

  if (ext === '.html' || ext === '.htm') {
    const base = path.basename(originalName).replace(/\\/g, '/');
    const rel = sanitizeRel(base);
    if (!rel) throw new HttpError(400, '文件名不合法', 'BAD_NAME');
    const abs = path.join(destDir, rel);
    await fsp.writeFile(abs, buffer);
    written.push({ path: rel, size: buffer.length });
    total = buffer.length;
  } else if (ext === '.zip') {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    if (entries.length === 0) throw new HttpError(400, 'zip 为空', 'EMPTY_ZIP');
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const rawName = entry.entryName.replace(/\\/g, '/');
      if (rawName.startsWith('__MACOSX/') || rawName.endsWith('.DS_Store')) continue;
      const rel = sanitizeRel(rawName);
      if (!rel) throw new HttpError(400, `zip 内含非法路径：${rawName}`, 'BAD_ZIP_PATH');
      if (isSymlinkEntry(entry)) throw new HttpError(400, 'zip 内含符号链接，已拒绝', 'ZIP_SYMLINK');
      const entryExt = path.posix.extname(rel).toLowerCase();
      if (!ALLOWED_EXTS.has(entryExt)) {
        throw new HttpError(400, `不支持的文件类型：${rel}`, 'BAD_ZIP_TYPE');
      }
      const data = entry.getData();
      total += data.length;
      if (total > MAX_TOTAL_BYTES) throw new HttpError(400, '解压后总体积超过 200MB', 'ZIP_TOO_LARGE');
      written.push({ path: rel, size: data.length });
      if (written.length > MAX_FILES) throw new HttpError(400, 'zip 内文件数超过 1000 个', 'ZIP_TOO_MANY');
      const abs = path.join(destDir, rel);
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, data);
    }
  } else {
    throw new HttpError(400, '仅支持 .html / .htm / .zip 文件', 'BAD_TYPE');
  }

  const files = await listPreviewFiles(destDir);
  let entryPath: string | null = null;
  if (entryOverride) {
    const rel = sanitizeRel(entryOverride);
    if (rel && files.some((f) => f.path === rel)) entryPath = rel;
  }
  if (!entryPath) entryPath = pickEntry(files);
  if (!entryPath) throw new HttpError(400, '没有找到可作为入口的 html 文件', 'NO_ENTRY');
  return { files, entryPath, totalSize: total };
}

export async function removePreviewDir(id: string): Promise<void> {
  await fsp.rm(previewDir(id), { recursive: true, force: true });
}

export async function loadHtmlPreview(id: string) {
  const preview = await prisma.htmlPreview.findUnique({
    where: { id },
    include: { workspace: true },
  });
  if (!preview) throw new HttpError(404, 'HTML 预览不存在', 'NOT_FOUND');
  return preview;
}

type HtmlUser = { id: string; role: string };
type HtmlPreviewWithWs = Awaited<ReturnType<typeof loadHtmlPreview>>;

export function canReadHtml(user: HtmlUser, preview: HtmlPreviewWithWs): boolean {
  if (user.role === 'ADMIN') return true;
  if (preview.workspace.kind === 'PUBLIC') return true;
  return preview.workspace.ownerId === user.id || preview.createdById === user.id;
}

export function canWriteHtml(user: HtmlUser, preview: HtmlPreviewWithWs): boolean {
  if (user.role === 'ADMIN') return true;
  return preview.workspace.ownerId === user.id || preview.createdById === user.id;
}

export function assertWorkspaceWritable(
  user: HtmlUser,
  workspace: { id: string; kind: string; ownerId: string },
): void {
  if (workspace.kind === 'PRIVATE' && workspace.ownerId !== user.id && user.role !== 'ADMIN') {
    throw new HttpError(403, '无权限', 'FORBIDDEN');
  }
}
