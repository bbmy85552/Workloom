import type { Request, Response } from 'express';
import { env } from '../env.js';

const LEGACY_AUTH_COOKIE = 'jianji_session';

export function readAuthCookie(req: Request): string | undefined {
  return req.cookies?.[env.COOKIE_NAME] || req.cookies?.[LEGACY_AUTH_COOKIE];
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(env.COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 3600 * 1000,
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(env.COOKIE_NAME, { path: '/' });
  if (env.COOKIE_NAME !== LEGACY_AUTH_COOKIE) {
    res.clearCookie(LEGACY_AUTH_COOKIE, { path: '/' });
  }
}
