import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma } from '../prisma.js';
import { env } from '../env.js';
import { hashPassword, verifyPassword } from '../lib/hash.js';
import { signToken } from '../lib/jwt.js';
import { setAuthCookie, clearAuthCookie } from '../lib/cookie.js';
import { asyncHandler, HttpError } from '../lib/asyncHandler.js';
import { consumeVerificationCode, requestVerificationCode } from '../lib/verifyCode.js';
import { requireAuth } from '../middleware/auth.js';
import { hashSessionToken, revokeSessionByToken } from '../lib/session.js';
import { isPublicRegisterAllowed, verifyRegisterInviteCode } from '../lib/systemSettings.js';
import { verifyGoogleCredential } from '../lib/googleAuth.js';

export const authRouter = Router();

const emailSchema = z.string().email('邮箱格式不合法').max(120);
const passwordSchema = z
  .string()
  .min(8, '密码长度不少于 8 位')
  .max(64, '密码长度不超过 64 位');
const codeSchema = z.string().regex(/^\d{6}$/, '验证码为 6 位数字');
const inviteCodeSchema = z.string().trim().min(1, '请输入邀请码').max(120);

function clientIp(req: any) {
  return (req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || 'unknown') as string;
}

function clientUserAgent(req: any): string | undefined {
  const ua = req.headers['user-agent'];
  if (!ua) return undefined;
  return String(ua).slice(0, 240);
}

async function issueSessionToken(
  user: { id: string; email: string; role: string },
  meta: { userAgent?: string; ipAddr?: string },
) {
  const sid = crypto.randomBytes(16).toString('hex');
  const token = signToken({ sub: user.id, email: user.email, role: user.role, sid });
  // 用 jwt 的解码后 exp 作为过期时间（粗略策略：固定 7 天）
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      id: sid,
      userId: user.id,
      tokenHash: hashSessionToken(token),
      userAgent: meta.userAgent || null,
      ipAddr: meta.ipAddr || null,
      expiresAt,
    },
  });
  return token;
}

function userBrief(user: { id: string; email: string; name: string; role: string; avatarUrl: string | null }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
  };
}

authRouter.post(
  '/validate-invite',
  asyncHandler(async (req, res) => {
    if (!(await isPublicRegisterAllowed())) {
      throw new HttpError(403, '当前实例已关闭注册', 'REGISTER_CLOSED');
    }
    const { inviteCode } = z.object({ inviteCode: inviteCodeSchema }).parse(req.body);
    if (!(await verifyRegisterInviteCode(inviteCode))) {
      throw new HttpError(403, '邀请码不正确', 'INVALID_INVITE_CODE');
    }
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/register-code',
  asyncHandler(async (req, res) => {
    if (!(await isPublicRegisterAllowed())) {
      throw new HttpError(403, '当前实例已关闭注册', 'REGISTER_CLOSED');
    }
    const { email, inviteCode } = z
      .object({
        email: emailSchema,
        inviteCode: inviteCodeSchema,
      })
      .parse(req.body);
    if (!(await verifyRegisterInviteCode(inviteCode))) {
      throw new HttpError(403, '邀请码不正确', 'INVALID_INVITE_CODE');
    }
    const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (exists) throw new HttpError(409, '该邮箱已注册', 'EMAIL_TAKEN');
    const result = await requestVerificationCode({
      email,
      purpose: 'register',
      ip: clientIp(req),
    });
    res.json(result);
  }),
);

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    if (!(await isPublicRegisterAllowed())) {
      throw new HttpError(403, '当前实例已关闭注册', 'REGISTER_CLOSED');
    }
    const body = z
      .object({
        email: emailSchema,
        code: codeSchema,
        inviteCode: inviteCodeSchema,
        password: passwordSchema,
        name: z.string().trim().min(1, '请输入用户名').max(40),
      })
      .parse(req.body);
    if (!(await verifyRegisterInviteCode(body.inviteCode))) {
      throw new HttpError(403, '邀请码不正确', 'INVALID_INVITE_CODE');
    }
    const normalized = body.email.toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email: normalized } });
    if (exists) throw new HttpError(409, '该邮箱已注册', 'EMAIL_TAKEN');
    await consumeVerificationCode({ email: normalized, purpose: 'register', code: body.code });
    const user = await prisma.user.create({
      data: {
        email: normalized,
        passwordHash: await hashPassword(body.password),
        name: body.name,
        role: 'USER',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.workspace.create({ data: { name: `${body.name} 的空间`, ownerId: user.id } });
    const token = await issueSessionToken(user, {
      userAgent: clientUserAgent(req),
      ipAddr: clientIp(req),
    });
    setAuthCookie(res, token);
    res.json({ user: userBrief(user) });
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = z
      .object({ email: emailSchema, password: z.string().min(1) })
      .parse(req.body);
    const normalized = body.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (!user) throw new HttpError(401, '邮箱或密码错误', 'INVALID_CREDENTIALS');
    if (user.status === 'DISABLED') throw new HttpError(403, '账号已被禁用', 'USER_DISABLED');
    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) throw new HttpError(401, '邮箱或密码错误', 'INVALID_CREDENTIALS');
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const token = await issueSessionToken(user, {
      userAgent: clientUserAgent(req),
      ipAddr: clientIp(req),
    });
    setAuthCookie(res, token);
    res.json({ user: userBrief(user) });
  }),
);

authRouter.post(
  '/google',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        credential: z.string().trim().min(1),
        inviteCode: z.string().trim().max(120).optional(),
      })
      .parse(req.body);
    const profile = await verifyGoogleCredential(body.credential);
    const existing = await prisma.user.findUnique({ where: { email: profile.email } });
    let user = existing;

    if (user) {
      if (user.status === 'DISABLED') throw new HttpError(403, '账号已被禁用', 'USER_DISABLED');
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
          avatarUrl: user.avatarUrl || profile.picture || undefined,
          lastLoginAt: new Date(),
        },
      });
    } else {
      if (!(await isPublicRegisterAllowed())) {
        throw new HttpError(403, '当前实例已关闭注册', 'REGISTER_CLOSED');
      }
      if (!body.inviteCode || !(await verifyRegisterInviteCode(body.inviteCode))) {
        throw new HttpError(403, '邀请码不正确', 'INVALID_INVITE_CODE');
      }
      user = await prisma.user.create({
        data: {
          email: profile.email,
          passwordHash: await hashPassword(crypto.randomBytes(32).toString('hex')),
          name: profile.name,
          avatarUrl: profile.picture ?? null,
          role: 'USER',
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
          lastLoginAt: new Date(),
        },
      });
      await prisma.workspace.create({ data: { name: `${profile.name} 的空间`, ownerId: user.id } });
    }

    const token = await issueSessionToken(user, {
      userAgent: clientUserAgent(req),
      ipAddr: clientIp(req),
    });
    setAuthCookie(res, token);
    res.json({ user: userBrief(user), created: !existing });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token =
      req.cookies?.[env.COOKIE_NAME] ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : undefined);
    if (token) {
      await revokeSessionByToken(token).catch(() => undefined);
    }
    clearAuthCookie(res);
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
      },
    });
    res.json({ user });
  }),
);

authRouter.post(
  '/forgot-code',
  asyncHandler(async (req, res) => {
    const { email } = z.object({ email: emailSchema }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      res.json({ ok: true });
      return;
    }
    const result = await requestVerificationCode({
      email,
      purpose: 'reset_password',
      ip: clientIp(req),
    });
    res.json(result);
  }),
);

authRouter.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const body = z
      .object({ email: emailSchema, code: codeSchema, password: passwordSchema })
      .parse(req.body);
    const normalized = body.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (!user) throw new HttpError(400, '该邮箱未注册', 'USER_NOT_FOUND');
    await consumeVerificationCode({ email: normalized, purpose: 'reset_password', code: body.code });
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(body.password) },
    });
    res.json({ ok: true });
  }),
);
