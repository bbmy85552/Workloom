import crypto from 'node:crypto';

const KEY_PREFIX = 'jj_live_';

export function generateApiKey() {
  return `${KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
}

export function hashApiKey(key: string) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function apiKeyPrefix(key: string) {
  return key.slice(0, 16);
}

export function maskApiKey(prefix: string) {
  return `${prefix}${'•'.repeat(8)}`;
}
