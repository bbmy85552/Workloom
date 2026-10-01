import { useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ChevronLeft, Shield, Users, History, LogOut, UsersRound, Settings, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../store/auth';
import { Toast } from './Toast';
import { api } from '../../lib/api';
import type { UserPreferences } from '../../lib/types';
import { applyTheme, subscribeSystemThemeChange } from '../../lib/theme';
import { applyLanguage } from '../../lib/i18n';

const items = [
  { to: '/admin/users', label: '用户管理', icon: Users },
  { to: '/admin/groups', label: '用户组', icon: UsersRound },
  { to: '/admin/settings', label: '系统设置', icon: Settings },
  { to: '/admin/trash', label: '回收站', icon: Trash2 },
  { to: '/admin/audit', label: '审计日志', icon: History },
];

export function AdminShell() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    let cleanupSystemTheme = () => {};
    void api
      .get<{ preferences: UserPreferences }>('/me/preferences')
      .then(({ data }) => {
        if (!alive) return;
        const pref = data.preferences;
        applyTheme(pref);
        applyLanguage(pref.language);
        if (pref.theme === 'system') {
          cleanupSystemTheme = subscribeSystemThemeChange(() => applyTheme(pref));
        }
      })
      .catch(() => {
        if (!alive) return;
        applyTheme();
        applyLanguage();
        cleanupSystemTheme = subscribeSystemThemeChange(() => applyTheme());
      });
    return () => {
      alive = false;
      cleanupSystemTheme();
    };
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface md:flex-row">
      <aside className="w-full shrink-0 border-b border-black/5 bg-surface-container-lowest/70 backdrop-blur-md md:h-full md:w-60 md:border-b-0 md:border-r md:flex md:flex-col">
        <div className="p-4 md:p-6">
          <Link to="/app/dashboard" className="mb-3 flex items-center gap-2 text-sm text-text-secondary hover:text-liquid-indigo md:mb-6">
            <ChevronLeft size={16} /> 返回工作台
          </Link>
          <div className="mb-3 flex items-center gap-3 md:mb-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-liquid-indigo/20 bg-liquid-indigo/10 text-liquid-indigo shadow-sm shadow-liquid-indigo/10">
              <Shield size={17} />
            </div>
            <div className="text-sm font-semibold text-text-primary">管理后台</div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:space-y-1 md:overflow-x-visible md:pb-0">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all md:w-full ${
                  isActive
                    ? 'bg-liquid-indigo/10 text-liquid-indigo font-semibold ring-1 ring-liquid-indigo/20 shadow-sm shadow-liquid-indigo/5'
                    : 'text-text-secondary hover:bg-black/5 hover:text-text-primary'
                }`
              }
            >
              <it.icon size={18} className="shrink-0" />
              <span>{it.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="hidden p-4 mb-2 md:block">
          <div className="text-xs text-text-secondary mb-2">登录为 {user?.name}</div>
          <button
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-text-secondary hover:bg-black/5 hover:text-text-primary rounded-xl transition-colors"
          >
            <LogOut size={16} />
            退出
          </button>
        </div>
      </aside>

      <div className="flex-1 overflow-hidden flex flex-col">
        <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
          <div className="max-w-[1200px] mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>

      <Toast />
    </div>
  );
}
