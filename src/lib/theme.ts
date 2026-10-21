export const DEFAULT_THEME_COLOR = '#5E5CE6';
export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_COLOR_PRESETS = [
  { name: '靛蓝', value: '#5E5CE6' },
  { name: '蓝色', value: '#2563EB' },
  { name: '青色', value: '#0891B2' },
  { name: '绿色', value: '#16A34A' },
  { name: '琥珀', value: '#D97706' },
  { name: '玫红', value: '#DB2777' },
  { name: '紫色', value: '#7C3AED' },
  { name: '石墨', value: '#374151' },
] as const;

function clamp(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function expandHex(hex: string) {
  const normalized = hex.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) return normalized;
  return DEFAULT_THEME_COLOR;
}

function hexToRgb(hex: string) {
  const value = expandHex(hex).slice(1);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
}

function mix(hex: string, target: '#000000' | '#ffffff', weight: number) {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  return rgbToHex({
    r: a.r * (1 - weight) + b.r * weight,
    g: a.g * (1 - weight) + b.g * weight,
    b: a.b * (1 - weight) + b.b * weight,
  });
}

function luminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function normalizeThemeColor(value?: string | null) {
  return expandHex(value || DEFAULT_THEME_COLOR).toUpperCase();
}

export function resolveThemePreference(theme: ThemePreference = 'system'): ResolvedTheme {
  if (theme === 'light' || theme === 'dark') return theme;
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyThemeColor(value?: string | null, mode?: ResolvedTheme) {
  const color = normalizeThemeColor(value);
  const root = document.documentElement;
  const resolved = mode ?? (root.dataset.theme === 'dark' ? 'dark' : 'light');
  const primary = resolved === 'dark' ? mix(color, '#ffffff', 0.1) : mix(color, '#000000', 0.12);
  const primaryContainer =
    resolved === 'dark' ? mix(color, '#000000', 0.38) : mix(color, '#ffffff', 0.16);
  root.style.setProperty('--color-liquid-indigo', color);
  root.style.setProperty('--color-primary', primary);
  root.style.setProperty('--color-primary-container', primaryContainer);
  root.style.setProperty('--color-surface-tint', color);
  root.style.setProperty('--color-on-primary', luminance(color) > 0.55 ? '#111827' : '#ffffff');
  root.style.setProperty('--workloom-theme-color', color);
  return color;
}

export function applyTheme({
  theme = 'system',
  themeColor = DEFAULT_THEME_COLOR,
}: {
  theme?: ThemePreference | null;
  themeColor?: string | null;
} = {}) {
  const resolved = resolveThemePreference(theme ?? 'system');
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  applyThemeColor(themeColor, resolved);
  return resolved;
}

export function subscribeSystemThemeChange(callback: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}
