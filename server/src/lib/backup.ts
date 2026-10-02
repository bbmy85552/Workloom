import { prisma } from '../prisma.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../env.js';
import { UPLOAD_ROOT } from './upload.js';

const MODEL_KEYS = [
  ['users', 'user'],
  ['sessions', 'session'],
  ['emailVerificationCodes', 'emailVerificationCode'],
  ['rateLimitEvents', 'rateLimitEvent'],
  ['workspaces', 'workspace'],
  ['documents', 'document'],
  ['documentComments', 'documentComment'],
  ['documentFavorites', 'documentFavorite'],
  ['documentPermissions', 'documentPermission'],
  ['documentVersions', 'documentVersion'],
  ['tableBases', 'tableBase'],
  ['tablePermissions', 'tablePermission'],
  ['tableFields', 'tableField'],
  ['tableRecords', 'tableRecord'],
  ['tableFormViews', 'tableFormView'],
  ['todoItems', 'todoItem'],
  ['calendarEvents', 'calendarEvent'],
  ['calendarReminderLogs', 'calendarReminderLog'],
  ['mailAccounts', 'mailAccount'],
  ['mailMessages', 'mailMessage'],
  ['notifications', 'notification'],
  ['userPreferences', 'userPreferences'],
  ['attachments', 'attachment'],
  ['userAvatars', 'userAvatar'],
  ['userFonts', 'userFont'],
  ['shareLinks', 'shareLink'],
  ['resourcePresence', 'resourcePresence'],
  ['userGroups', 'userGroup'],
  ['userGroupMembers', 'userGroupMember'],
  ['auditLogs', 'auditLog'],
  ['systemSettings', 'systemSetting'],
] as const;

const DELETE_ORDER = [
  'calendarReminderLog',
  'documentComment',
  'mailMessage',
  'mailAccount',
  'notification',
  'session',
  'emailVerificationCode',
  'rateLimitEvent',
  'resourcePresence',
  'shareLink',
  'documentFavorite',
  'documentPermission',
  'documentVersion',
  'attachment',
  'tableFormView',
  'tableRecord',
  'tableField',
  'tablePermission',
  'tableBase',
  'calendarEvent',
  'todoItem',
  'userPreferences',
  'userAvatar',
  'userFont',
  'userGroupMember',
  'userGroup',
  'auditLog',
  'document',
  'workspace',
  'systemSetting',
  'user',
] as const;

const CREATE_ORDER = [
  'user',
  'systemSetting',
  'workspace',
  'document',
  'auditLog',
  'userGroup',
  'userGroupMember',
  'userFont',
  'userAvatar',
  'userPreferences',
  'todoItem',
  'calendarEvent',
  'tableBase',
  'tablePermission',
  'tableField',
  'tableRecord',
  'tableFormView',
  'attachment',
  'documentVersion',
  'documentPermission',
  'documentFavorite',
  'shareLink',
  'resourcePresence',
  'rateLimitEvent',
  'emailVerificationCode',
  'session',
  'notification',
  'mailAccount',
  'mailMessage',
  'documentComment',
  'calendarReminderLog',
] as const;

const KEY_BY_DELEGATE = new Map<string, string>(MODEL_KEYS.map(([key, delegate]) => [delegate, key]));

export interface BackupPayload {
  version: 1;
  exportedAt: string;
  app: 'workloom';
  data: Record<string, unknown[]>;
  counts: Record<string, number>;
}

export interface MigrationFile {
  path: string;
  size: number;
  contentBase64: string;
}

export interface MigrationPayload extends Omit<BackupPayload, 'version'> {
  version: 2;
  files: MigrationFile[];
  config: {
    appUrl: string;
    cookieSecure: boolean;
    mailEnabled: boolean;
    allowPublicRegister: boolean;
    note: string;
  };
}

export async function createBackupPayload(): Promise<BackupPayload> {
  const p = prisma as unknown as Record<string, { findMany: (args?: unknown) => Promise<unknown[]> }>;
  const data: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const [key, delegate] of MODEL_KEYS) {
    const rows = await p[delegate].findMany();
    data[key] = rows;
    counts[key] = rows.length;
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: 'workloom',
    data,
    counts,
  };
}

async function collectUploadFiles(dir = UPLOAD_ROOT): Promise<MigrationFile[]> {
  const files: MigrationFile[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectUploadFiles(abs));
      continue;
    }
    if (!entry.isFile()) continue;
    const rel = path.relative(UPLOAD_ROOT, abs).replace(/\\/g, '/');
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    const content = await fs.readFile(abs);
    files.push({ path: rel, size: content.length, contentBase64: content.toString('base64') });
  }
  return files;
}

export async function createMigrationPayload(): Promise<MigrationPayload> {
  const backup = await createBackupPayload();
  return {
    ...backup,
    version: 2,
    files: await collectUploadFiles(),
    config: {
      appUrl: env.APP_URL,
      cookieSecure: env.COOKIE_SECURE,
      mailEnabled: env.MAIL_ENABLED,
      allowPublicRegister: env.ALLOW_PUBLIC_REGISTER,
      note: '此配置摘要不包含 JWT_SECRET、SETUP_TOKEN、SMTP 密码、AccessKey 或其它明文密钥。',
    },
  };
}

function rowsFor(data: Record<string, unknown>, delegate: string) {
  const key = KEY_BY_DELEGATE.get(delegate);
  const rows = key ? data[key] : [];
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

async function createMany(tx: Record<string, any>, delegate: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  await tx[delegate].createMany({ data: rows });
}

export async function restoreBackupPayload(payload: { data?: Record<string, unknown> }) {
  const data = payload.data ?? {};
  await prisma.$transaction(
    async (tx) => {
      const t = tx as unknown as Record<string, any>;
      for (const delegate of DELETE_ORDER) {
        await t[delegate].deleteMany({});
      }

      for (const delegate of CREATE_ORDER) {
        const rows = rowsFor(data, delegate);
        if (delegate === 'document') {
          await createMany(
            t,
            delegate,
            rows.map((row) => ({ ...row, parentId: null })),
          );
          for (const row of rows) {
            if (typeof row.id === 'string' && typeof row.parentId === 'string') {
              await t.document.update({ where: { id: row.id }, data: { parentId: row.parentId } });
            }
          }
          continue;
        }
        if (delegate === 'documentComment') {
          await createMany(
            t,
            delegate,
            rows.map((row) => ({ ...row, parentId: null })),
          );
          for (const row of rows) {
            if (typeof row.id === 'string' && typeof row.parentId === 'string') {
              await t.documentComment.update({
                where: { id: row.id },
                data: { parentId: row.parentId },
              });
            }
          }
          continue;
        }
        await createMany(t, delegate, rows);
      }
    },
    { timeout: 30_000 },
  );
  const counts: Record<string, number> = {};
  for (const [key, delegate] of MODEL_KEYS) counts[key] = rowsFor(data, delegate).length;
  return counts;
}

function safeUploadPath(rel: string) {
  const normalized = rel.replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('..')) return null;
  const abs = path.resolve(UPLOAD_ROOT, normalized);
  if (!abs.startsWith(UPLOAD_ROOT + path.sep)) return null;
  return abs;
}

export async function restoreMigrationPayload(payload: { data?: Record<string, unknown>; files?: unknown }) {
  const counts = await restoreBackupPayload(payload);
  const files = Array.isArray(payload.files) ? payload.files : [];
  let restoredFiles = 0;
  for (const item of files) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Partial<MigrationFile>;
    if (typeof f.path !== 'string' || typeof f.contentBase64 !== 'string') continue;
    const abs = safeUploadPath(f.path);
    if (!abs) continue;
    const content = Buffer.from(f.contentBase64, 'base64');
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content);
    restoredFiles += 1;
  }
  return { counts, restoredFiles };
}
