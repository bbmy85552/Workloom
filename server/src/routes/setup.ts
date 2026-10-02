import { Router } from 'express';
import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { env } from '../env.js';
import { asyncHandler, HttpError } from '../lib/asyncHandler.js';
import { hashPassword } from '../lib/hash.js';
import { encryptSecret } from '../lib/crypto.js';
import { smtpVerify } from '../lib/mail/smtp.js';
import { SYSTEM_SETTING_KEYS, isSystemInitialized } from '../lib/systemSettings.js';
import { countInWindow, recordEvent } from '../lib/rateLimit.js';

export const setupRouter = Router();

const SETUP_COOKIE = 'workloom_setup';
const LEGACY_SETUP_COOKIE = 'jianji_setup';
const SETUP_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

const emailSchema = z.string().email('邮箱格式不合法').max(120);
const passwordSchema = z
  .string()
  .min(8, '密码长度不少于 8 位')
  .max(64, '密码长度不超过 64 位');

function setSetupCookie(res: Response, token: string) {
  res.cookie(SETUP_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/api/setup',
    maxAge: SETUP_SESSION_TTL_MS,
  });
}

function clearSetupCookie(res: Response) {
  res.clearCookie(SETUP_COOKIE, { path: '/api/setup' });
  res.clearCookie(LEGACY_SETUP_COOKIE, { path: '/api/setup' });
}

function clientIp(req: Request) {
  return req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || 'unknown';
}

function setupTokenMatches(input: string) {
  if (!env.SETUP_TOKEN) return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(env.SETUP_TOKEN).digest();
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signSetupSession() {
  return jwt.sign({ scope: 'setup' }, env.JWT_SECRET, { expiresIn: '2h' });
}

function hasValidSetupSession(req: Request) {
  const token = req.cookies?.[SETUP_COOKIE] || req.cookies?.[LEGACY_SETUP_COOKIE];
  if (!token) return false;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { scope?: string };
    return payload.scope === 'setup';
  } catch {
    return false;
  }
}

function requireSetupSession(req: Request) {
  if (!hasValidSetupSession(req)) {
    throw new HttpError(401, '请使用部署时生成的初始化链接进入配置页面', 'SETUP_SESSION_REQUIRED');
  }
}

setupRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const initialized = await isSystemInitialized();
    res.json({
      initialized,
      setupAvailable: !initialized && Boolean(env.SETUP_TOKEN),
      tokenRequired: !initialized,
    });
  }),
);

setupRouter.get(
  '/session',
  asyncHandler(async (req, res) => {
    const initialized = await isSystemInitialized();
    res.json({ ok: !initialized && hasValidSetupSession(req), initialized });
  }),
);

setupRouter.post(
  '/session',
  asyncHandler(async (req, res) => {
    if (await isSystemInitialized()) {
      clearSetupCookie(res);
      throw new HttpError(409, '系统已经完成初始化', 'SETUP_ALREADY_DONE');
    }
    const { token } = z.object({ token: z.string().min(1).max(256) }).parse(req.body);
    const ip = clientIp(req);
    const attempts = await countInWindow({
      scope: 'setup:token:ip',
      key: ip,
      windowSeconds: 3600,
    });
    if (attempts >= 10) {
      throw new HttpError(429, '初始化密钥尝试过于频繁，请稍后再试', 'SETUP_TOKEN_RATE_LIMITED');
    }
    if (!setupTokenMatches(token)) {
      await recordEvent('setup:token:ip', ip);
      throw new HttpError(401, '初始化密钥无效', 'SETUP_TOKEN_INVALID');
    }
    setSetupCookie(res, signSetupSession());
    res.json({ ok: true });
  }),
);

const setupCompleteSchema = z.object({
  appUrl: z.string().url('请输入有效的访问地址').max(200),
  adminEmail: emailSchema,
  adminName: z.string().trim().min(1, '请输入管理员名称').max(40),
  adminPassword: passwordSchema,
  allowPublicRegister: z.boolean(),
  mailHost: z.string().trim().min(1, '请输入 SMTP 服务器').max(120),
  mailPort: z.coerce.number().int().min(1).max(65535),
  mailSecure: z.boolean(),
  mailUser: z.string().trim().min(1, '请输入 SMTP 用户名').max(160),
  mailPass: z.string().min(1, '请输入 SMTP 授权码或应用专用密码').max(256),
  mailFrom: z.string().trim().min(1, '请输入发信人').max(200),
  verifySmtp: z.boolean().optional(),
});

setupRouter.post(
  '/complete',
  asyncHandler(async (req, res) => {
    if (await isSystemInitialized()) {
      clearSetupCookie(res);
      throw new HttpError(409, '系统已经完成初始化', 'SETUP_ALREADY_DONE');
    }
    requireSetupSession(req);
    const body = setupCompleteSchema.parse(req.body);
    if (env.NODE_ENV === 'production' || body.verifySmtp !== false) {
      try {
        await smtpVerify({
          host: body.mailHost,
          port: body.mailPort,
          secure: body.mailSecure,
          user: body.mailUser,
          pass: body.mailPass,
        });
      } catch (err) {
        throw new HttpError(502, `SMTP 验证失败：${(err as Error).message}`, 'SMTP_VERIFY_FAILED');
      }
    }

    const normalizedEmail = body.adminEmail.toLowerCase();
    const encryptedMailPass = encryptSecret(body.mailPass);

    await prisma.$transaction(async (tx) => {
      const userCount = await tx.user.count();
      if (userCount > 0) {
        throw new HttpError(409, '系统已经存在用户，不能重复初始化', 'SETUP_ALREADY_DONE');
      }
      const admin = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash: await hashPassword(body.adminPassword),
          name: body.adminName,
          role: 'ADMIN',
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
        },
      });
      await tx.workspace.create({
        data: { name: '默认空间', ownerId: admin.id, kind: 'PRIVATE' },
      });
      await tx.workspace.create({
        data: { name: '公共知识库', ownerId: admin.id, kind: 'PUBLIC' },
      });

      const settings: Record<string, string> = {
        [SYSTEM_SETTING_KEYS.setupCompletedAt]: new Date().toISOString(),
        [SYSTEM_SETTING_KEYS.setupCompletedBy]: normalizedEmail,
        [SYSTEM_SETTING_KEYS.appUrl]: body.appUrl,
        [SYSTEM_SETTING_KEYS.allowPublicRegister]: String(body.allowPublicRegister),
        [SYSTEM_SETTING_KEYS.defaultWorkspaceName]: '我的空间',
        [SYSTEM_SETTING_KEYS.mailEnabled]: 'true',
        [SYSTEM_SETTING_KEYS.mailHost]: body.mailHost,
        [SYSTEM_SETTING_KEYS.mailPort]: String(body.mailPort),
        [SYSTEM_SETTING_KEYS.mailSecure]: String(body.mailSecure),
        [SYSTEM_SETTING_KEYS.mailUser]: body.mailUser,
        [SYSTEM_SETTING_KEYS.mailPassEnc]: encryptedMailPass,
        [SYSTEM_SETTING_KEYS.mailFrom]: body.mailFrom,
      };

      await Promise.all(
        Object.entries(settings).map(([key, value]) =>
          tx.systemSetting.upsert({
            where: { key },
            update: { value },
            create: { key, value },
          }),
        ),
      );
    });

    clearSetupCookie(res);
    res.json({ ok: true, loginPath: '/login' });
  }),
);
