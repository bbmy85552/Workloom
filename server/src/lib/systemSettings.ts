import { prisma } from '../prisma.js';
import { env } from '../env.js';
import { decryptSecret } from './crypto.js';

export const SYSTEM_SETTING_KEYS = {
  setupCompletedAt: 'setup_completed_at',
  setupCompletedBy: 'setup_completed_by',
  appUrl: 'app_url',
  allowPublicRegister: 'allow_public_register',
  defaultWorkspaceName: 'default_workspace_name',
  brandName: 'brand_name',
  companyName: 'company_name',
  oaUrl: 'oa_url',
  registerInviteCode: 'register_invite_code',
  mailEnabled: 'mail_enabled',
  mailHost: 'mail_host',
  mailPort: 'mail_port',
  mailSecure: 'mail_secure',
  mailUser: 'mail_user',
  mailPassEnc: 'mail_pass_enc',
  mailFrom: 'mail_from',
} as const;

export interface RuntimeMailConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

function toBool(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function toInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function getSystemSettingMap() {
  const rows = await prisma.systemSetting.findMany();
  return Object.fromEntries(rows.map((row) => [row.key, row.value])) as Record<string, string>;
}

export async function isSystemInitialized() {
  const marker = await prisma.systemSetting.findUnique({
    where: { key: SYSTEM_SETTING_KEYS.setupCompletedAt },
  });
  if (marker) return true;
  const userCount = await prisma.user.count();
  return userCount > 0;
}

export async function isPublicRegisterAllowed() {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: SYSTEM_SETTING_KEYS.allowPublicRegister },
  });
  if (!setting) return env.ALLOW_PUBLIC_REGISTER;
  return toBool(setting.value, env.ALLOW_PUBLIC_REGISTER);
}

export async function verifyRegisterInviteCode(inviteCode: string) {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: SYSTEM_SETTING_KEYS.registerInviteCode },
  });
  const expected = setting?.value.trim();
  if (!expected) return false;
  return inviteCode.trim() === expected;
}

export async function getPublicBrandSettings() {
  const map = await getSystemSettingMap();
  return {
    brandName: map[SYSTEM_SETTING_KEYS.brandName]?.trim() || '文档中心',
    companyName: map[SYSTEM_SETTING_KEYS.companyName]?.trim() || '文档中心',
    oaUrl: map[SYSTEM_SETTING_KEYS.oaUrl]?.trim() || 'https://2dqy-oa.2dqy.com/calendar',
    googleClientId: env.GOOGLE_CLIENT_ID,
  };
}

export async function getMailBrandName() {
  const map = await getSystemSettingMap();
  return (
    map[SYSTEM_SETTING_KEYS.companyName]?.trim() ||
    map[SYSTEM_SETTING_KEYS.brandName]?.trim() ||
    '文档中心'
  );
}

export async function getRuntimeMailConfig(): Promise<RuntimeMailConfig | null> {
  const map = await getSystemSettingMap();
  if (map[SYSTEM_SETTING_KEYS.mailEnabled] !== undefined) {
    const enabled = toBool(map[SYSTEM_SETTING_KEYS.mailEnabled], false);
    if (!enabled) return null;
    const passEnc = map[SYSTEM_SETTING_KEYS.mailPassEnc] ?? '';
    return {
      enabled,
      host: map[SYSTEM_SETTING_KEYS.mailHost] ?? '',
      port: toInt(map[SYSTEM_SETTING_KEYS.mailPort], 465),
      secure: toBool(map[SYSTEM_SETTING_KEYS.mailSecure], true),
      user: map[SYSTEM_SETTING_KEYS.mailUser] ?? '',
      pass: passEnc ? decryptSecret(passEnc) : '',
      from: map[SYSTEM_SETTING_KEYS.mailFrom] ?? '',
    };
  }

  if (!env.MAIL_ENABLED) return null;
  return {
    enabled: env.MAIL_ENABLED,
    host: env.MAIL_HOST,
    port: env.MAIL_PORT,
    secure: env.MAIL_SECURE,
    user: env.MAIL_USER,
    pass: env.MAIL_PASS,
    from: env.MAIL_FROM,
  };
}
