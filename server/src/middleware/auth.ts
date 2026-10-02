import type { Request, Response, NextFunction } from 'express';
import { readAuthCookie } from '../lib/cookie.js';
import { verifyToken, type JwtPayload } from '../lib/jwt.js';
import { HttpError } from '../lib/asyncHandler.js';
import { prisma } from '../prisma.js';
import { findActiveSessionByToken, touchSession } from '../lib/session.js';

export interface AuthedUser {
  id: string;
  email: string;
  role: string;
  status: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser;
      sessionId?: string;
      authToken?: string;
    }
  }
}

function extractToken(req: Request): string | undefined {
  const cookie = readAuthCookie(req);
  if (cookie) return cookie;
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return undefined;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (!token) throw new HttpError(401, '未登录', 'UNAUTHENTICATED');
    let payload: JwtPayload;
    try {
      payload = verifyToken(token);
    } catch {
      throw new HttpError(401, '登录已过期，请重新登录', 'TOKEN_INVALID');
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, status: true, name: true },
    });
    if (!user) throw new HttpError(401, '用户不存在', 'USER_NOT_FOUND');
    if (user.status === 'DISABLED')
      throw new HttpError(403, '账号已被禁用，请联系管理员', 'USER_DISABLED');
    if (payload.sid) {
      // 仅在 token 中带 sid 的会话才执行吊销校验,兼容旧 token
      const session = await findActiveSessionByToken(token);
      if (!session || session.userId !== user.id) {
        throw new HttpError(401, '会话已注销，请重新登录', 'SESSION_REVOKED');
      }
      req.sessionId = session.id;
      void touchSession(session.id);
    }
    req.user = user;
    req.authToken = token;
    next();
  } catch (err) {
    next(err);
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (!token) return next();
    let payload: JwtPayload;
    try {
      payload = verifyToken(token);
    } catch {
      return next();
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, status: true, name: true },
    });
    if (user && user.status !== 'DISABLED') {
      req.user = user;
    }
  } catch {
    /* ignore */
  }
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, '未登录', 'UNAUTHENTICATED'));
  if (req.user.role !== 'ADMIN')
    return next(new HttpError(403, '需要管理员权限', 'FORBIDDEN'));
  next();
}
