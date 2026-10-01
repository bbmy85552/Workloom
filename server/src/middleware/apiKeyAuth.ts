import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../lib/asyncHandler.js';
import { hashApiKey } from '../lib/apiKey.js';
import { prisma } from '../prisma.js';

function extractApiKey(req: Request) {
  const header = req.headers['x-jianji-api-key'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  return undefined;
}

export async function authenticateApiKeyValue(key: string | undefined) {
  if (!key) throw new HttpError(401, '缺少 API Key', 'API_KEY_REQUIRED');
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(key) },
    include: { user: { select: { id: true, email: true, role: true, status: true, name: true } } },
  });
  if (!apiKey) throw new HttpError(401, 'API Key 无效', 'API_KEY_INVALID');
  if (apiKey.user.status === 'DISABLED') {
    throw new HttpError(403, '账号已被禁用，请联系管理员', 'USER_DISABLED');
  }
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  });
  return apiKey.user;
}

export function extractApiKeyFromRequest(req: Request) {
  return extractApiKey(req);
}

export async function requireApiKey(req: Request, _res: Response, next: NextFunction) {
  try {
    req.user = await authenticateApiKeyValue(extractApiKey(req));
    next();
  } catch (err) {
    next(err);
  }
}
