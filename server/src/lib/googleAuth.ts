import { env } from '../env.js';
import { HttpError } from './asyncHandler.js';

interface GoogleTokenInfo {
  aud?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
  sub?: string;
}

export interface GoogleProfile {
  email: string;
  name: string;
  picture?: string;
  sub?: string;
}

export async function verifyGoogleCredential(credential: string): Promise<GoogleProfile> {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new HttpError(503, '未配置 Google 登录', 'GOOGLE_NOT_CONFIGURED');
  }
  const token = credential.trim();
  if (!token) throw new HttpError(400, '缺少 Google 登录凭证', 'GOOGLE_CREDENTIAL_REQUIRED');

  let info: GoogleTokenInfo;
  try {
    const url = new URL('https://oauth2.googleapis.com/tokeninfo');
    url.searchParams.set('id_token', token);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Google tokeninfo ${response.status}`);
    info = (await response.json()) as GoogleTokenInfo;
  } catch {
    throw new HttpError(401, 'Google 登录验证失败', 'GOOGLE_VERIFY_FAILED');
  }

  if (info.aud !== env.GOOGLE_CLIENT_ID) {
    throw new HttpError(401, 'Google 登录来源不匹配', 'GOOGLE_AUDIENCE_MISMATCH');
  }
  if (info.email_verified !== true && info.email_verified !== 'true') {
    throw new HttpError(401, 'Google 邮箱尚未验证', 'GOOGLE_EMAIL_NOT_VERIFIED');
  }
  const email = info.email?.trim().toLowerCase();
  if (!email) throw new HttpError(401, 'Google 账号缺少邮箱', 'GOOGLE_EMAIL_MISSING');

  return {
    email,
    name: info.name?.trim() || email.split('@')[0],
    picture: info.picture?.trim() || undefined,
    sub: info.sub?.trim() || undefined,
  };
}
