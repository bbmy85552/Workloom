import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

function toBool(v: string | undefined, def = false) {
  if (v === undefined) return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function toInt(v: string | undefined, def: number) {
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

export const env = {
  NODE_ENV: nodeEnv,
  PORT: toInt(process.env.PORT, 4000),
  APP_URL: appUrl,
  APP_URLS: appUrl.split(',').map((u) => u.trim()).filter(Boolean),

  DATABASE_URL: process.env.DATABASE_URL ?? 'file:./prisma/dev.db',

  JWT_SECRET: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '7d',
  COOKIE_NAME: process.env.COOKIE_NAME ?? 'jianji_session',
  COOKIE_SECURE: toBool(process.env.COOKIE_SECURE, false),
  SETUP_TOKEN: process.env.SETUP_TOKEN ?? '',

  ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? 'admin@example.com',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? 'replace-with-a-strong-admin-password',
  ADMIN_NAME: process.env.ADMIN_NAME ?? '管理员',

  MAIL_ENABLED: toBool(process.env.MAIL_ENABLED, false),
  MAIL_HOST: process.env.MAIL_HOST ?? '',
  MAIL_PORT: toInt(process.env.MAIL_PORT, 465),
  MAIL_SECURE: toBool(process.env.MAIL_SECURE, true),
  MAIL_USER: process.env.MAIL_USER ?? '',
  MAIL_PASS: process.env.MAIL_PASS ?? '',
  MAIL_FROM: process.env.MAIL_FROM ?? '文档中心 <no-reply@jianji.local>',

  GOOGLE_CLIENT_ID:
    process.env.GOOGLE_CLIENT_ID ?? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '',

  CODE_TTL_SECONDS: toInt(process.env.CODE_TTL_SECONDS, 600),
  CODE_RESEND_INTERVAL_SECONDS: toInt(process.env.CODE_RESEND_INTERVAL_SECONDS, 60),
  CODE_MAX_PER_HOUR_PER_EMAIL: toInt(process.env.CODE_MAX_PER_HOUR_PER_EMAIL, 5),
  CODE_MAX_PER_HOUR_PER_IP: toInt(process.env.CODE_MAX_PER_HOUR_PER_IP, 20),
  CODE_MAX_PER_DAY_PER_EMAIL: toInt(process.env.CODE_MAX_PER_DAY_PER_EMAIL, 20),
  CODE_MAX_ATTEMPTS: toInt(process.env.CODE_MAX_ATTEMPTS, 5),

  ALLOW_PUBLIC_REGISTER: toBool(process.env.ALLOW_PUBLIC_REGISTER, true),

  APP_VERSION: process.env.APP_VERSION ?? '',
  JIANJI_LATEST_VERSION: process.env.JIANJI_LATEST_VERSION ?? '',
  JIANJI_CURRENT_COMMIT: process.env.JIANJI_CURRENT_COMMIT ?? '',
  JIANJI_UPDATE_REPO: process.env.JIANJI_UPDATE_REPO ?? 'https://github.com/staklab/jianji.git',
  JIANJI_UPDATE_BRANCH: process.env.JIANJI_UPDATE_BRANCH ?? 'main',
  JIANJI_UPDATE_CHECK_URL:
    process.env.JIANJI_UPDATE_CHECK_URL ?? 'https://api.github.com/repos/staklab/jianji/commits/main',
  JIANJI_UPDATE_COMMAND: process.env.JIANJI_UPDATE_COMMAND ?? '',
};

export function assertSafeProductionEnv(options: { initialized?: boolean } = {}) {
  if (env.NODE_ENV !== 'production') return;
  const weakSecrets = new Set([
    'dev-secret-change-me',
    'local-dev-secret-please-change-me-to-a-long-random-string',
    'please-change-this-to-a-long-random-string',
  ]);
  if (!process.env.JWT_SECRET || weakSecrets.has(env.JWT_SECRET) || env.JWT_SECRET.length < 32) {
    throw new Error('生产环境必须设置长度至少 32 位的 JWT_SECRET。');
  }
  if (options.initialized === false && env.SETUP_TOKEN.length < 32) {
    throw new Error('生产环境首次初始化前必须设置长度至少 32 位的 SETUP_TOKEN。');
  }
}

export type AppEnv = typeof env;
