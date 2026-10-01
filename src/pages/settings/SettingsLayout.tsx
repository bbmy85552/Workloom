import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

const items = [
  { to: '/app/settings/profile', label: '个人资料' },
  { to: '/app/settings/security', label: '密码与邮箱' },
  { to: '/app/settings/cli', label: 'AI 与 CLI' },
  { to: '/app/settings/preferences', label: '偏好设置' },
  { to: '/app/settings/fonts', label: '字体管理' },
];

export function SettingsLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="py-6 sm:py-8 animate-fade-in-up">
      <header className="mb-6">
        <h1 className="text-3xl font-serif font-bold text-text-primary mb-1">设置</h1>
        <p className="text-text-secondary text-sm">管理你的账户、安全与个性化偏好。</p>
      </header>

      <div className="flex flex-col md:flex-row gap-6">
        <nav className="md:w-56 shrink-0 flex md:flex-col gap-1 overflow-x-auto pb-1 md:pb-0">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              className={({ isActive }) =>
                `px-3 py-2 rounded-xl text-sm whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-liquid-indigo/10 text-liquid-indigo font-semibold'
                    : 'text-text-secondary hover:bg-black/5'
                }`
              }
            >
              {it.label}
            </NavLink>
          ))}
        </nav>
        <section className="flex-1 min-w-0">
          <div className="glass-card rounded-2xl p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-text-primary mb-1">{title}</h2>
            {subtitle && <p className="text-sm text-text-secondary mb-6">{subtitle}</p>}
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="mb-5">
      <div className="text-xs font-medium text-text-secondary mb-1.5">{label}</div>
      {children}
      {hint && <div className="text-xs text-text-secondary mt-1">{hint}</div>}
    </div>
  );
}
