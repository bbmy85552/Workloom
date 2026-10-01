import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutGrid,
  BookOpen,
  Table,
  Settings,
  HelpCircle,
  Plus,
  Shield,
  LogOut,
  Calendar,
  Mail,
  Clock,
  BriefcaseBusiness,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAuthStore } from '../../store/auth';
import { useUiStore } from '../../store/ui';
import { BrandLogo } from '../BrandLogo';

const navItems = [
  { to: '/app/dashboard', label: '工作台', icon: LayoutGrid },
  { to: '/app/docs', label: '知识库', icon: BookOpen },
  { to: '/app/tables', label: '数据表', icon: Table },
  { to: '/app/calendar', label: '日历', icon: Calendar },
  { to: '/app/mail', label: '邮箱', icon: Mail },
  { to: '/app/recent', label: '最近', icon: Clock },
  { to: '/app/oa', label: 'OA', icon: BriefcaseBusiness },
  { to: '/app/settings/profile', label: '设置', icon: Settings },
];

interface SidebarProps {
  collapsedOverride?: boolean;
}

export function Sidebar({ collapsedOverride }: SidebarProps = {}) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setSidebar = useUiStore((s) => s.setSidebar);
  const collapsedFromStore = useUiStore((s) => s.sidebarCollapsed);
  const toggleCollapsed = useUiStore((s) => s.toggleCollapsed);
  const setCollapsed = useUiStore((s) => s.setCollapsed);
  const collapsed = collapsedOverride ?? collapsedFromStore;
  const navigate = useNavigate();

  const widthCls = collapsed ? 'w-[68px]' : 'w-64';

  return (
    <aside
      className={`${widthCls} shrink-0 h-full flex flex-col border-r border-black/5 bg-surface-container-lowest/70 backdrop-blur-md transition-[width] duration-200`}
    >
      <div className={collapsed ? 'p-3 pt-6' : 'p-6 pt-6'}>
        <div
          className={
            collapsed
              ? 'flex flex-col items-center gap-3 mb-6'
              : 'flex items-center justify-between mb-6'
          }
        >
          <BrandLogo size="sm" showText={!collapsed} />
          {!collapsedOverride && (
            <button
              onClick={toggleCollapsed}
              className="hidden md:inline-flex items-center justify-center w-7 h-7 rounded-md text-text-secondary hover:bg-black/5"
              title={collapsed ? '展开侧栏' : '收起侧栏'}
            >
              {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
            </button>
          )}
        </div>

        <button
          className={`w-full bg-liquid-indigo hover:bg-primary text-white rounded-xl py-2.5 ${collapsed ? 'px-0' : 'px-4'} flex items-center justify-center gap-2 text-sm font-medium transition-all shadow-md shadow-liquid-indigo/20`}
          onClick={() => {
            setSidebar(false);
            navigate('/app/docs');
          }}
          title="新建文档"
        >
          <Plus size={16} />
          {!collapsed && '新建文档'}
        </button>
      </div>

      <nav className={`flex-1 ${collapsed ? 'px-2' : 'px-3'} space-y-1`}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => {
              setSidebar(false);
              if (item.to === '/app/oa' && !collapsedOverride) setCollapsed(true);
            }}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              `w-full flex items-center ${collapsed ? 'justify-center' : 'gap-3 px-3'} py-2.5 rounded-xl text-sm transition-all relative overflow-hidden ${
                isActive
                  ? 'bg-liquid-indigo/10 text-liquid-indigo font-semibold'
                  : 'text-text-secondary hover:bg-black/5'
              }`
            }
          >
            <item.icon size={18} />
            {!collapsed && item.label}
          </NavLink>
        ))}

        {user?.role === 'ADMIN' && (
          <NavLink
            to="/admin/users"
            onClick={() => setSidebar(false)}
            title={collapsed ? '管理后台' : undefined}
            className={({ isActive }) =>
              `w-full flex items-center ${collapsed ? 'justify-center' : 'gap-3 px-3'} py-2.5 rounded-xl text-sm transition-all ${
                isActive
                  ? 'bg-liquid-indigo/10 text-liquid-indigo font-semibold'
                  : 'text-text-secondary hover:bg-black/5'
              }`
            }
          >
            <Shield size={18} />
            {!collapsed && '管理后台'}
          </NavLink>
        )}
      </nav>

      <div className={`${collapsed ? 'p-2' : 'p-4'} space-y-1 mb-2`}>
        {!collapsed && (
          <a
            href="https://github.com/staklab/jianji"
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-text-secondary hover:bg-black/5 rounded-xl transition-colors"
          >
            <HelpCircle size={16} />
            帮助
          </a>
        )}
        <button
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
          title={collapsed ? '退出登录' : undefined}
          className={`w-full flex items-center ${collapsed ? 'justify-center' : 'gap-3 px-3'} py-2 text-sm text-text-secondary hover:bg-black/5 rounded-xl transition-colors`}
        >
          <LogOut size={16} />
          {!collapsed && '退出登录'}
        </button>
      </div>
    </aside>
  );
}
