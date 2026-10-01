import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import { normalizeFilename } from './filename.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_ROOT = path.resolve(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

function uniqueRoots(roots: string[]) {
  return Array.from(new Set(roots.map((root) => path.resolve(root))));
}

function uploadRootCandidates() {
  return uniqueRoots([
    UPLOAD_ROOT,
    path.resolve(UPLOAD_ROOT, '..', 'dist', 'uploads'),
    path.resolve(process.cwd(), 'uploads'),
    path.resolve(process.cwd(), 'server', 'uploads'),
  ]);
}

const yearMonth = () => new Date().toISOString().slice(0, 7);

function safeExt(originalName: string) {
  const ext = path.extname(normalizeFilename(originalName)).toLowerCase();
  if (!/^\.[a-z0-9]{1,8}$/i.test(ext)) return '';
  return ext;
}

function makeStorage(subdir: string) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(UPLOAD_ROOT, subdir, yearMonth());
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}_${nanoid(10)}${safeExt(file.originalname)}`);
    },
  });
}

const MAX_FILE_SIZE = 25 * 1024 * 1024;
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export async function storeUploadBuffer(
  buffer: Buffer,
  options: { subdir: string; originalName: string },
) {
  const dir = path.join(UPLOAD_ROOT, options.subdir, yearMonth());
  await fs.promises.mkdir(dir, { recursive: true });
  const filename = `${Date.now()}_${nanoid(10)}${safeExt(options.originalName)}`;
  const absPath = path.join(dir, filename);
  await fs.promises.writeFile(absPath, buffer);
  return {
    absPath,
    storedName: storedRelative(absPath),
  };
}

export const uploadAny = multer({
  storage: makeStorage('attachments'),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
});

export const uploadMailAttachments = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 10 },
});

const IMAGE_REGEX = /^image\/(png|jpe?g|gif|webp|bmp)$/i;

export const uploadImage = multer({
  storage: makeStorage('attachments'),
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_REGEX.test(file.mimetype)) cb(null, true);
    else cb(new Error('仅支持 PNG / JPG / GIF / WebP / BMP 图片'));
  },
});

export const uploadAvatar = multer({
  storage: makeStorage('avatars'),
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_REGEX.test(file.mimetype)) cb(null, true);
    else cb(new Error('仅支持 PNG / JPG / GIF / WebP / BMP 图片作为头像'));
  },
});

const DOC_IMPORT_REGEX =
  /(application\/(vnd\.openxmlformats-officedocument\.wordprocessingml\.document|octet-stream|msword)|text\/(markdown|plain))/i;

export const uploadDocImport = multer({
  storage: makeStorage('imports'),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    const originalName = normalizeFilename(file.originalname);
    if (
      DOC_IMPORT_REGEX.test(file.mimetype) ||
      /\.(docx|md|markdown|txt)$/i.test(originalName)
    ) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 .docx / .md / .markdown / .txt 文件'));
    }
  },
});

export const uploadCsv = multer({
  storage: makeStorage('imports'),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (/csv|excel|spreadsheet|plain/i.test(file.mimetype) || /\.csv$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 CSV 文件'));
    }
  },
});

export function publicAvatarUrl(storedName: string, storedDir: string) {
  const rel = path.relative(UPLOAD_ROOT, storedDir).replace(/\\/g, '/');
  return `/api/static/${rel}/${storedName}`;
}

export function storedRelative(absPath: string) {
  return path.relative(UPLOAD_ROOT, absPath).replace(/\\/g, '/');
}

export function resolveUploadPath(storedName: string) {
  const abs = path.resolve(UPLOAD_ROOT, storedName);
  if (abs !== UPLOAD_ROOT && !abs.startsWith(UPLOAD_ROOT + path.sep)) return null;
  return abs;
}

function resolveUploadPathIn(root: string, storedName: string) {
  const normalizedRoot = path.resolve(root);
  const abs = path.resolve(normalizedRoot, storedName);
  if (abs !== normalizedRoot && !abs.startsWith(normalizedRoot + path.sep)) return null;
  return abs;
}

export function resolveExistingUploadPath(storedName: string) {
  if (!resolveUploadPath(storedName)) return null;
  for (const root of uploadRootCandidates()) {
    const abs = resolveUploadPathIn(root, storedName);
    if (abs && fs.existsSync(abs)) return abs;
  }
  return resolveUploadPath(storedName);
}

export { normalizeFilename };
