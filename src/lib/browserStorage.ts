// Keep preferences from existing deployments while writing only Workloom keys.
export function readBrowserValue(key: string, legacyKey: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key) ?? window.localStorage.getItem(legacyKey);
  } catch {
    return null;
  }
}

export function writeBrowserValue(key: string, value: string, legacyKey: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
    window.localStorage.removeItem(legacyKey);
  } catch {
    // Storage may be disabled; the in-memory preference still applies.
  }
}

export function clearBrowserValue(key: string, legacyKey: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
    window.localStorage.removeItem(legacyKey);
  } catch {
    // Storage may be disabled.
  }
}
