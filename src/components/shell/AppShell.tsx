import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Toast } from './Toast';
import { useUiStore } from '../../store/ui';
import { api } from '../../lib/api';
import type { UserPreferences } from '../../lib/types';
import { applyTheme, subscribeSystemThemeChange } from '../../lib/theme';
import { applyLanguage } from '../../lib/i18n';

export function AppShell() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebar = useUiStore((s) => s.setSidebar);
  const location = useLocation();
  const isMailPage = location.pathname.startsWith('/app/mail');
  const isOaPage = location.pathname.startsWith('/app/oa');

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
    <div className="flex h-screen w-screen overflow-hidden bg-surface">
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setSidebar(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-surface-container-lowest shadow-xl animate-fade-in-up">
            <Sidebar collapsedOverride={false} />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[400px] bg-gradient-to-br from-liquid-indigo/10 to-transparent pointer-events-none -z-10" />
        <Header />
        <main
          className={`flex-1 min-h-0 px-4 sm:px-6 lg:px-10 pb-12 pt-2 sm:pt-4 w-full ${
            isMailPage || isOaPage ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'
          }`}
        >
          <div className={`w-full ${isMailPage || isOaPage ? 'flex-1 min-h-0 flex flex-col' : ''}`}>
            <Outlet />
          </div>
        </main>
      </div>

      <Toast />
    </div>
  );
}
