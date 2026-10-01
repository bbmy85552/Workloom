import { prisma } from '../prisma.js';
import { env } from '../env.js';
import { generateNumericCode, sha256 } from './hash.js';
import { renderCodeMail, sendMail } from './mail.js';
import { countInWindow, lastInWindow, recordEvent } from './rateLimit.js';
import { HttpError } from './asyncHandler.js';
import { getMailBrandName } from './systemSettings.js';

export type VerifyPurpose =
  | 'register'
  | 'bind_email'
  | 'change_email'
  | 'reset_password';

export interface RequestCodeInput {
  email: string;
  purpose: VerifyPurpose;
  ip: string;
}

// 仅在 test 环境填充，便于测试用例读取最近一次明文验证码。
export const __testCodeMap = new Map<string, string>();

export async function requestVerificationCode({ email, purpose, ip }: RequestCodeInput) {
  const normalizedEmail = email.trim().toLowerCase();

  const lastEmailEvent = await lastInWindow({
    scope: `code:${purpose}:email`,
    key: normalizedEmail,
  });
  if (lastEmailEvent) {
    const elapsed = (Date.now() - lastEmailEvent.createdAt.getTime()) / 1000;
    const remaining = env.CODE_RESEND_INTERVAL_SECONDS - elapsed;
    if (remaining > 0) {
      throw new HttpError(
        429,
        `请等待 ${Math.ceil(remaining)} 秒后再试`,
        'CODE_RESEND_TOO_FAST',
        { remainingSeconds: Math.ceil(remaining) },
      );
    }
  }

  const hourEmailCount = await countInWindow({
    scope: `code:${purpose}:email`,
    key: normalizedEmail,
    windowSeconds: 3600,
  });
  if (hourEmailCount >= env.CODE_MAX_PER_HOUR_PER_EMAIL) {
    throw new HttpError(429, '该邮箱发送验证码过于频繁，请稍后再试', 'CODE_HOURLY_EMAIL_LIMIT');
  }

  const dayEmailCount = await countInWindow({
    scope: `code:${purpose}:email`,
    key: normalizedEmail,
    windowSeconds: 24 * 3600,
  });
  if (dayEmailCount >= env.CODE_MAX_PER_DAY_PER_EMAIL) {
    throw new HttpError(429, '该邮箱今日验证码次数已达上限', 'CODE_DAILY_EMAIL_LIMIT');
  }

  const hourIpCount = await countInWindow({
    scope: `code:${purpose}:ip`,
    key: ip,
    windowSeconds: 3600,
  });
  if (hourIpCount >= env.CODE_MAX_PER_HOUR_PER_IP) {
    throw new HttpError(429, '当前网络请求验证码过于频繁，请稍后再试', 'CODE_HOURLY_IP_LIMIT');
  }

  await prisma.emailVerificationCode.updateMany({
    where: { email: normalizedEmail, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = generateNumericCode(6);
  await prisma.emailVerificationCode.create({
    data: {
      email: normalizedEmail,
      purpose,
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + env.CODE_TTL_SECONDS * 1000),
    },
  });

  if (env.NODE_ENV === 'test') {
    __testCodeMap.set(`${normalizedEmail}:${purpose}`, code);
  }

  const brandName = await getMailBrandName();
  const mail = renderCodeMail(code, purpose, brandName);
  try {
    await sendMail({ to: normalizedEmail, ...mail });
  } catch {
    await prisma.emailVerificationCode.updateMany({
      where: { email: normalizedEmail, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    throw new HttpError(503, '邮件服务未配置或发送失败，请联系管理员', 'MAIL_SEND_FAILED');
  }

  await recordEvent(`code:${purpose}:email`, normalizedEmail);
  await recordEvent(`code:${purpose}:ip`, ip);

  return { ok: true, ttlSeconds: env.CODE_TTL_SECONDS };
}

export interface VerifyCodeInput {
  email: string;
  purpose: VerifyPurpose;
  code: string;
}

export async function consumeVerificationCode({ email, purpose, code }: VerifyCodeInput) {
  const normalizedEmail = email.trim().toLowerCase();
  const record = await prisma.emailVerificationCode.findFirst({
    where: { email: normalizedEmail, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) throw new HttpError(400, '请先获取验证码', 'CODE_NOT_FOUND');
  if (record.expiresAt < new Date()) {
    throw new HttpError(400, '验证码已过期，请重新获取', 'CODE_EXPIRED');
  }
  if (record.attempts >= env.CODE_MAX_ATTEMPTS) {
    await prisma.emailVerificationCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    throw new HttpError(429, '验证码尝试次数过多，请重新获取', 'CODE_TOO_MANY_ATTEMPTS');
  }
  const ok = record.codeHash === sha256(code.trim());
  if (!ok) {
    await prisma.emailVerificationCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    throw new HttpError(400, '验证码不正确', 'CODE_MISMATCH');
  }
  await prisma.emailVerificationCode.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });
  return { ok: true };
}
