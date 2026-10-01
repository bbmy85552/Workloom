import fs from 'node:fs';
import path from 'node:path';
import mammoth from 'mammoth';
import { marked } from 'marked';
import { extension, lookup } from 'mime-types';
import { normalizeFilename } from './filename.js';
import { MAX_IMAGE_SIZE } from './upload.js';

interface PersistImageInput {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}

interface ImportOptions {
  persistImage?: (image: PersistImageInput) => Promise<string>;
}

const IMAGE_MIME = /^image\/(png|jpe?g|gif|webp|bmp)$/i;
const DATA_IMAGE_RE = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i;

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch);
}

function imageName(prefix: string, mimeType: string) {
  const ext = extension(mimeType) || 'bin';
  return `${prefix}.${ext}`;
}

async function persistImportImage(
  image: PersistImageInput,
  options?: ImportOptions,
) {
  if (!options?.persistImage) return null;
  if (!IMAGE_MIME.test(image.mimeType)) return null;
  if (image.buffer.length > MAX_IMAGE_SIZE) return null;
  return options.persistImage(image);
}

async function fetchRemoteImage(src: string) {
  const res = await fetch(src, {
    redirect: 'follow',
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || '';
  if (!IMAGE_MIME.test(mimeType)) return null;
  const size = Number(res.headers.get('content-length') || '0');
  if (size > MAX_IMAGE_SIZE) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_IMAGE_SIZE) return null;
  const pathname = new URL(src).pathname;
  const basename = normalizeFilename(path.basename(pathname)) || imageName('remote-image', mimeType);
  return { buffer, mimeType, originalName: basename };
}

async function loadMarkdownImage(src: string, filePath: string) {
  const data = src.match(DATA_IMAGE_RE);
  if (data) {
    const mimeType = data[1].toLowerCase();
    if (!IMAGE_MIME.test(mimeType)) return null;
    const buffer = Buffer.from(data[2], 'base64');
    if (buffer.length > MAX_IMAGE_SIZE) return null;
    return { buffer, mimeType, originalName: imageName('inline-image', mimeType) };
  }

  if (/^https?:\/\//i.test(src)) return fetchRemoteImage(src);
  if (/^(\/|#|mailto:|tel:)/i.test(src)) return null;

  const normalized = path.normalize(src.split(/[?#]/)[0]);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) return null;
  const abs = path.resolve(path.dirname(filePath), normalized);
  if (!abs.startsWith(path.dirname(filePath) + path.sep)) return null;
  if (!fs.existsSync(abs)) return null;
  const stat = await fs.promises.stat(abs);
  if (!stat.isFile() || stat.size > MAX_IMAGE_SIZE) return null;
  const mimeType = lookup(abs) || '';
  if (!IMAGE_MIME.test(mimeType)) return null;
  return {
    buffer: await fs.promises.readFile(abs),
    mimeType,
    originalName: normalizeFilename(path.basename(abs)),
  };
}

async function replaceAsync(input: string, pattern: RegExp, replacer: (...args: string[]) => Promise<string>) {
  const matches = Array.from(input.matchAll(pattern));
  const replacements = await Promise.all(matches.map((match) => replacer(...(match as unknown as string[]))));
  let output = input;
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const match = matches[i];
    output = `${output.slice(0, match.index)}${replacements[i]}${output.slice((match.index ?? 0) + match[0].length)}`;
  }
  return output;
}

async function persistMarkdownImages(html: string, filePath: string, options?: ImportOptions) {
  return replaceAsync(
    html,
    /<img\b([^>]*?)\bsrc=(["'])(.*?)\2([^>]*)>/gi,
    async (full, before, quote, src, after) => {
      try {
        const image = await loadMarkdownImage(src, filePath);
        if (!image) return full;
        const url = await persistImportImage(image, options);
        if (!url) return full;
        return `<img${before}src=${quote}${url}${quote}${after}>`;
      } catch {
        return full;
      }
    },
  );
}

export async function importDocxToHtml(filePath: string, options?: ImportOptions) {
  const result = await mammoth.convertToHtml(
    { path: filePath },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const buffer = await image.readAsBuffer();
        const mimeType = image.contentType.toLowerCase();
        const url = await persistImportImage(
          {
            buffer,
            mimeType,
            originalName: imageName('docx-image', mimeType),
          },
          options,
        );
        if (url) return { src: url };
        return { src: `data:${mimeType};base64,${buffer.toString('base64')}` };
      }),
    },
  );
  return result.value;
}

export async function importMarkdownToHtml(filePath: string, options?: ImportOptions) {
  const raw = await fs.promises.readFile(filePath, 'utf-8');
  const html = await marked.parse(raw, { async: true });
  return persistMarkdownImages(html, filePath, options);
}

export async function importPlainTextToHtml(filePath: string) {
  const raw = await fs.promises.readFile(filePath, 'utf-8');
  return raw
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

export async function importByExtension(filePath: string, originalName: string, options?: ImportOptions) {
  const ext = path.extname(normalizeFilename(originalName)).toLowerCase();
  if (ext === '.docx') return importDocxToHtml(filePath, options);
  if (ext === '.md' || ext === '.markdown') return importMarkdownToHtml(filePath, options);
  if (ext === '.txt') return importPlainTextToHtml(filePath);
  throw new Error(`不支持的文件格式：${ext || '未知'}`);
}
