import { NavLink } from 'react-router-dom';
import { BookOpen, Brain, LayoutGrid, Mail, Table } from 'lucide-react';

const ITEMS = [
  { to: '/app/dashboard', label: '工作台', icon: LayoutGrid },
  { to: '/app/docs', label: '知识库', icon: BookOpen },
  { to: '/app/tables', label: '数据表', icon: Table },
  { to: '/app/memory', label: '项目记忆', icon: Brain },
  { to: '/app/mail', label: '邮箱', icon: Mail },
];

// 手机底部导航：五个主入口单手可达；其余入口仍在左上角菜单抽屉里。
export function MobileTabBar() {
  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-black/5 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-5">
        {ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] ${
                isActive ? 'text-liquid-indigo font-medium' : 'text-text-secondary'
              }`
            }
          >
            <item.icon size={22} />
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
