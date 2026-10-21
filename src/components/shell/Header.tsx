import { Menu } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth';
import { useUiStore } from '../../store/ui';
import { NotificationBell } from './NotificationBell';

function pageTitle(path: string) {
  if (path.startsWith('/app/dashboard')) return '工作台';
  if (path.startsWith('/app/docs')) return '知识库';
  if (path.startsWith('/app/tables')) return '数据表';
  if (path.startsWith('/app/calendar')) return '日历';
  if (path.startsWith('/app/mail')) return '邮箱';
  if (path.startsWith('/app/recent')) return '最近';
  if (path.startsWith('/app/settings')) return '设置';
  if (path.startsWith('/admin')) return '管理后台';
  return '';
}

export function Header() {
  const user = useAuthStore((s) => s.user);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const location = useLocation();

  return (
    <header className="shrink-0 h-16 flex items-center justify-between px-4 sm:px-8 z-10 w-full">
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="md:hidden p-2.5 -ml-2 text-text-secondary hover:bg-black/5 rounded-full transition-colors"
          aria-label="打开菜单"
        >
          <Menu size={20} />
        </button>
        <div className="text-sm font-medium text-text-secondary">{pageTitle(location.pathname)}</div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <NotificationBell />

        <div className="w-px h-4 bg-black/10"></div>

        <Link
          to="/app/settings/profile"
          className="flex items-center gap-2 px-2 py-1.5 rounded-full hover:bg-black/5 transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-liquid-indigo/10 text-liquid-indigo flex items-center justify-center font-medium overflow-hidden border border-liquid-indigo/20">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm">{user?.name?.[0] ?? '简'}</span>
            )}
          </div>
          <span className="hidden sm:inline text-sm font-medium text-text-primary">
            {user?.name ?? '未登录'}
          </span>
        </Link>
      </div>
    </header>
  );
}
