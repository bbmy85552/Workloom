import { clearBrowserValue, readBrowserValue, writeBrowserValue } from './browserStorage';

const STORAGE_KEY = 'workloom.rememberedLogin.v1';
const LEGACY_STORAGE_KEY = 'jianji.rememberedLogin.v1';

export interface RememberedLogin {
  email: string;
}

function decode(value: string): RememberedLogin | null {
  try {
    const parsed = JSON.parse(value) as RememberedLogin & { password?: string };
    if (!parsed.email) return null;
    return { email: parsed.email };
  } catch {
    // Older builds base64-encoded the object. Keep only the email and discard any stored password.
  }
  try {
    const binary = window.atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as RememberedLogin & { password?: string };
    if (!parsed.email) return null;
    return { email: parsed.email };
  } catch {
    return null;
  }
}

export function readRememberedLogin(): RememberedLogin | null {
  if (typeof window === 'undefined') return null;
  const raw = readBrowserValue(STORAGE_KEY, LEGACY_STORAGE_KEY);
  return raw ? decode(raw) : null;
}

export function saveRememberedLogin(value: RememberedLogin) {
  writeBrowserValue(STORAGE_KEY, JSON.stringify({ email: value.email }), LEGACY_STORAGE_KEY);
}

export function clearRememberedLogin() {
  if (typeof window === 'undefined') return;
  clearBrowserValue(STORAGE_KEY, LEGACY_STORAGE_KEY);
}
