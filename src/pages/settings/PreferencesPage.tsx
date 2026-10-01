import { useEffect, useRef, useState } from 'react';
import { api, asApiError } from '../../lib/api';
import { useUiStore } from '../../store/ui';
import { SettingsLayout } from './SettingsLayout';
import type { UserPreferences } from '../../lib/types';
import {
  applyTheme,
  DEFAULT_THEME_COLOR,
  normalizeThemeColor,
  subscribeSystemThemeChange,
  THEME_COLOR_PRESETS,
} from '../../lib/theme';
import { applyLanguage } from '../../lib/i18n';

type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const DEFAULT_PREF: UserPreferences = {
  theme: 'system',
  themeColor: DEFAULT_THEME_COLOR,
  defaultHome: '/app/dashboard',
  editorFontFamily: null,
  editorFontSize: 16,
  autoSaveSeconds: 1,
  notifyInApp: true,
  notifyEmail: false,
  calendarDefaultRemind: 15,
  language: 'zh-CN',
  mailListPageSize: 30,
  mailSyncLimit: 50,
};

export function PreferencesPage() {
  const showToast = useUiStore((s) => s.showToast);
  const [pref, setPref] = useState<UserPreferences>(DEFAULT_PREF);
  const [loading, setLoading] = useState(true);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const loadedRef = useRef(false);
  const lastSavedRef = useRef('');

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api.get<{ preferences: UserPreferences }>('/me/preferences');
        const next = { ...DEFAULT_PREF, ...data.preferences };
        next.themeColor = normalizeThemeColor(next.themeColor);
        lastSavedRef.current = JSON.stringify(next);
        setPref(next);
        applyTheme(next);
        applyLanguage(next.language);
        loadedRef.current = true;
      } catch (err) {
        showToast(asApiError(err).error, 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  useEffect(() => {
    applyTheme(pref);
    applyLanguage(pref.language);
    if (pref.theme !== 'system') return undefined;
    return subscribeSystemThemeChange(() => applyTheme(pref));
  }, [pref]);

  useEffect(() => {
    if (!loadedRef.current || loading) return undefined;
    if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(pref.themeColor)) return undefined;

    const payload = { ...pref, themeColor: normalizeThemeColor(pref.themeColor) };
    const signature = JSON.stringify(payload);
    if (signature === lastSavedRef.current) return undefined;

    setAutoSaveStatus('saving');
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { data } = await api.put<{ preferences: UserPreferences }>(
            '/me/preferences',
            payload,
          );
          const next = { ...DEFAULT_PREF, ...data.preferences };
          next.themeColor = normalizeThemeColor(next.themeColor);
          lastSavedRef.current = JSON.stringify(next);
          setPref((current) =>
            JSON.stringify({ ...current, themeColor: normalizeThemeColor(current.themeColor) }) ===
            signature
              ? next
              : current,
          );
          applyTheme(next);
          applyLanguage(next.language);
          setAutoSaveStatus('saved');
          showToast('偏好已自动保存', 'success');
        } catch (err) {
          setAutoSaveStatus('error');
          showToast(asApiError(err).error, 'error');
        }
      })();
    }, 350);

    return () => window.clearTimeout(timer);
  }, [pref, loading, showToast]);

  if (loading) {
    return (
      <SettingsLayout title="偏好设置">
        <div className="text-sm text-text-secondary text-center py-6">加载中…</div>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout
      title="偏好设置"
      subtitle="这些设置仅影响当前账号的体验，立即生效，无需重启。"
    >
    <div className="space-y-6">
      <div className="rounded-xl border border-black/5 bg-surface-container-lowest px-4 py-3 text-xs text-text-secondary">
        {autoSaveStatus === 'saving'
          ? '正在自动保存…'
          : autoSaveStatus === 'saved'
            ? '所有偏好已自动保存'
            : autoSaveStatus === 'error'
              ? '自动保存失败，请稍后重试'
              : '修改后会自动保存，无需手动点击保存。'}
      </div>
      <section className="rounded-2xl p-5 space-y-4 border border-black/5 bg-surface-container-lowest">
        <h3 className="text-sm font-semibold text-text-primary">外观</h3>
        <Field label="主题">
          <select
            value={pref.theme}
            onChange={(e) => setPref({ ...pref, theme: e.target.value as UserPreferences['theme'] })}
            className="w-full px-3 py-2 rounded-xl border border-black/10 bg-white text-sm outline-none focus:border-liquid-indigo"
          >
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色（实验）</option>
          </select>
        </Field>
        <Field label="界面语言">
          <select
            value={pref.language}
            onChange={(e) =>
              setPref({ ...pref, language: e.target.value as UserPreferences['language'] })
            }
            className="w-full px-3 py-2 rounded-xl border border-black/10 bg-white text-sm outline-none focus:border-liquid-indigo"
          >
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
          </select>
        </Field>
        <Field label="主题色">
          <div className="space-y-3">
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {THEME_COLOR_PRESETS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setPref({ ...pref, themeColor: color.value })}
                  className={`h-10 rounded-xl border transition ${
                    normalizeThemeColor(pref.themeColor) === color.value
                      ? 'border-text-primary ring-2 ring-liquid-indigo/25'
                      : 'border-black/10 hover:border-black/25'
                  }`}
                  title={color.name}
                  aria-label={`选择${color.name}`}
                  style={{ backgroundColor: color.value }}
                />
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="color"
                value={normalizeThemeColor(pref.themeColor)}
                onChange={(e) => setPref({ ...pref, themeColor: e.target.value })}
                className="h-10 w-full sm:w-16 rounded-xl border border-black/10 bg-white p-1"
                aria-label="选择自定义主题色"
              />
              <input
                value={pref.themeColor}
                onChange={(e) => setPref({ ...pref, themeColor: e.target.value })}
                onBlur={(e) =>
                  setPref({ ...pref, themeColor: normalizeThemeColor(e.target.value) })
                }
                placeholder="#5E5CE6"
                className="w-full px-3 py-2 rounded-xl border border-black/10 bg-white text-sm font-mono outline-none focus:border-liquid-indigo"
              />
              <button
                type="button"
                onClick={() => setPref({ ...pref, themeColor: DEFAULT_THEME_COLOR })}
                className="shrink-0 px-3 py-2 rounded-xl border border-black/10 text-sm text-text-secondary hover:bg-black/5"
              >
                恢复默认
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <span
                className="inline-block h-4 w-4 rounded-full"
                style={{ backgroundColor: normalizeThemeColor(pref.themeColor) }}
              />
              当前颜色会用于按钮、选中态、链接和焦点高亮。
            </div>
          </div>
        </Field>
      </section>

      <section className="rounded-2xl p-5 space-y-4 border border-black/5 bg-surface-container-lowest">
        <h3 className="text-sm font-semibold text-text-primary">默认</h3>
        <Field label="登录后默认进入">
          <select
            value={pref.defaultHome}
            onChange={(e) => setPref({ ...pref, defaultHome: e.target.value })}
            className="w-full px-3 py-2 rounded-xl border border-black/10 bg-white text-sm outline-none focus:border-liquid-indigo"
          >
            <option value="/app/dashboard">工作台</option>
            <option value="/app/docs">知识库</option>
            <option value="/app/tables">数据表</option>
            <option value="/app/calendar">日历</option>
            <option value="/app/mail">邮箱</option>
            <option value="/app/recent">最近</option>
          </select>
        </Field>
      </section>

      <section className="rounded-2xl p-5 space-y-4 border border-black/5 bg-surface-container-lowest">
        <h3 className="text-sm font-semibold text-text-primary">编辑器</h3>
        <Field label="默认字体">
          <input
            type="text"
            value={pref.editorFontFamily ?? ''}
            onChange={(e) =>
              setPref({ ...pref, editorFontFamily: e.target.value.trim() || null })
            }
            placeholder="留空使用系统字体"
            className="w-full px-3 py-2 rounded-xl border border-black/10 bg-white text-sm outline-none focus:border-liquid-indigo"
          />
        </Field>
        <Field label={`默认字号（${pref.editorFontSize}px）`}>
          <input
            type="range"
            min={12}
            max={28}
            value={pref.editorFontSize}
            onChange={(e) => setPref({ ...pref, editorFontSize: Number(e.target.value) })}
            className="w-full"
          />
        </Field>
        <Field label={`自动保存间隔（${pref.autoSaveSeconds} 秒）`}>
          <input
            type="range"
            min={1}
            max={30}
            value={pref.autoSaveSeconds}
            onChange={(e) => setPref({ ...pref, autoSaveSeconds: Number(e.target.value) })}
            className="w-full"
          />
        </Field>
      </section>

      <section className="rounded-2xl p-5 space-y-4 border border-black/5 bg-surface-container-lowest">
        <h3 className="text-sm font-semibold text-text-primary">通知</h3>
        <Toggle
          label="站内通知"
          desc="日历提醒、表单提交、邀请等会推送到顶部的通知中心。"
          value={pref.notifyInApp}
          onChange={(v) => setPref({ ...pref, notifyInApp: v })}
        />
        <Toggle
          label="邮件通知"
          desc="重要提醒同步发送到我的注册邮箱（需服务器配置 SMTP）。"
          value={pref.notifyEmail}
          onChange={(v) => setPref({ ...pref, notifyEmail: v })}
        />
        <Field label={`日历默认提前提醒（${pref.calendarDefaultRemind} 分钟）`}>
          <input
            type="range"
            min={0}
            max={120}
            step={5}
            value={pref.calendarDefaultRemind}
            onChange={(e) =>
              setPref({ ...pref, calendarDefaultRemind: Number(e.target.value) })
            }
            className="w-full"
          />
        </Field>
      </section>
    </div>
    </SettingsLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-text-secondary mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-text-primary">{label}</div>
        {desc && <div className="text-xs text-text-secondary mt-0.5">{desc}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition ${
          value ? 'bg-liquid-indigo' : 'bg-black/15'
        }`}
        aria-pressed={value}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition ${
            value ? 'translate-x-5' : 'translate-x-0.5'
          } mt-0.5`}
        />
      </button>
    </div>
  );
}
