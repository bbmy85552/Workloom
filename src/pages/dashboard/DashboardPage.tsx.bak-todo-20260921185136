import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Calendar, CheckCircle2, Circle, FileText, Star, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, asApiError } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import { useUiStore } from '../../store/ui';
import type { TodoItem, TodoProgress, DashboardSummary } from '../../lib/types';
import { DEFAULT_PUBLIC_SETTINGS, fetchPublicSettings } from '../../lib/publicSettings';

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function isSameDay(a: string | null, b: string) {
  if (!a) return false;
  return a.slice(0, 10) === b;
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const showToast = useUiStore((s) => s.showToast);

  const [todayList, setTodayList] = useState<TodoItem[]>([]);
  const [progress, setProgress] = useState<TodoProgress>({ completed: 0, total: 0, percent: 0 });

  const [selectedDate, setSelectedDate] = useState(toISODate(new Date()));
  const [dayList, setDayList] = useState<TodoItem[]>([]);

  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState(toISODate(new Date()));
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [brandName, setBrandName] = useState(DEFAULT_PUBLIC_SETTINGS.brandName);

  const loadSummary = useCallback(async () => {
    try {
      const { data } = await api.get<DashboardSummary>('/dashboard/summary');
      setSummary(data);
    } catch {
      /* ignore */
    }
  }, []);

  const loadToday = useCallback(async () => {
    try {
      const { data } = await api.get<{ list: TodoItem[]; progress: TodoProgress }>(
        '/todos/today',
      );
      setTodayList(data.list);
      setProgress(data.progress);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  }, [showToast]);

  const loadDay = useCallback(
    async (date: string) => {
      try {
        const { data } = await api.get<{ list: TodoItem[] }>('/todos', { params: { date } });
        setDayList(data.list);
      } catch (err) {
        showToast(asApiError(err).error, 'error');
      }
    },
    [showToast],
  );

  useEffect(() => {
    void loadToday();
    void loadSummary();
    void fetchPublicSettings()
      .then((settings) => setBrandName(settings.brandName))
      .catch(() => undefined);
  }, [loadToday, loadSummary]);

  useEffect(() => {
    void loadDay(selectedDate);
  }, [selectedDate, loadDay]);

  const addTodo = async () => {
    const title = newTitle.trim();
    if (!title) return;
    try {
      await api.post('/todos', { title, dueDate: newDate });
      setNewTitle('');
      void loadToday();
      void loadDay(selectedDate);
      showToast('已添加待办', 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const toggleTodo = async (id: string, completed: boolean) => {
    setTodayList((list) =>
      list.map((t) => (t.id === id ? { ...t, completedAt: completed ? new Date().toISOString() : null } : t)),
    );
    setDayList((list) =>
      list.map((t) => (t.id === id ? { ...t, completedAt: completed ? new Date().toISOString() : null } : t)),
    );
    try {
      await api.patch(`/todos/${id}`, { completed });
      void loadToday();
    } catch (err) {
      showToast(asApiError(err).error, 'error');
      void loadToday();
      void loadDay(selectedDate);
    }
  };

  const removeTodo = async (id: string) => {
    try {
      await api.delete(`/todos/${id}`);
      void loadToday();
      void loadDay(selectedDate);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const today = useMemo(() => toISODate(new Date()), []);
  const isToday = selectedDate === today;

  return (
    <div className="animate-fade-in-up py-6 sm:py-8">
      <header className="mb-8">
        <h1 className="text-3xl sm:text-[40px] font-serif font-bold text-text-primary tracking-tight mb-2">
          欢迎回来，{user?.name ?? `${brandName}用户`}
        </h1>
        <p className="text-text-secondary">今天是 {today}，把重要的事情先完成吧。</p>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="glass-card p-6 rounded-2xl lg:col-span-1">
          <div className="text-xs text-text-secondary font-medium mb-2">今日进度</div>
          <div className="flex items-end gap-2 mb-3">
            <span className="text-4xl font-serif font-bold text-text-primary">{progress.percent}%</span>
            <span className="text-sm text-text-secondary mb-1">
              {progress.completed} / {progress.total} 已完成
            </span>
          </div>
          <div className="h-2 rounded-full bg-black/5 overflow-hidden">
            <div
              className="h-full bg-liquid-indigo rounded-full transition-all"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl lg:col-span-2">
          <div className="text-xs text-text-secondary font-medium mb-3">添加待办</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTodo()}
              placeholder="今天还有什么要完成？"
              className="flex-1 px-3 py-2.5 rounded-xl border border-black/10 bg-white/80 text-sm outline-none focus:border-liquid-indigo focus:ring-2 focus:ring-liquid-indigo/15"
            />
            <div className="flex gap-2">
              <div className="relative">
                <Calendar
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
                />
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="pl-8 pr-2 py-2.5 rounded-xl border border-black/10 bg-white/80 text-sm outline-none focus:border-liquid-indigo"
                />
              </div>
              <button
                onClick={addTodo}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-liquid-indigo text-white text-sm font-medium hover:bg-primary transition-colors"
              >
                <Plus size={14} /> 添加
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold font-serif">今日待办</h2>
          {!isToday && (
            <button
              onClick={() => setSelectedDate(today)}
              className="text-sm text-liquid-indigo hover:underline"
            >
              回到今天
            </button>
          )}
        </div>
        <TodoList list={todayList} onToggle={toggleTodo} onRemove={removeTodo} />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <SummaryCard
          title="今日日程"
          icon={Calendar}
          empty="今天没有日程"
          items={
            summary?.todayEvents.slice(0, 4).map((e) => ({
              key: e.id,
              title: e.title,
              sub: new Date(e.startAt).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              }),
              to: '/app/calendar',
            })) ?? []
          }
          moreTo="/app/calendar"
        />
        <SummaryCard
          title="即将到期"
          icon={Clock}
          empty="7 天内没有截止待办"
          items={
            summary?.upcomingTodos.slice(0, 4).map((t) => ({
              key: t.id,
              title: t.title,
              sub: t.dueDate ? t.dueDate.slice(0, 10) : '',
            })) ?? []
          }
        />
        <SummaryCard
          title="最近文档"
          icon={FileText}
          empty="还没有最近文档"
          items={
            summary?.recentDocs.slice(0, 4).map((d) => ({
              key: d.id,
              title: d.title,
              sub: new Date(d.updatedAt).toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              }),
              to: `/app/docs/${d.id}`,
            })) ?? []
          }
          moreTo="/app/recent"
        />
      </section>

      {summary && summary.favoriteDocs.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-bold font-serif mb-3 flex items-center gap-2">
            <Star size={16} className="text-amber-500" /> 我的收藏
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {summary.favoriteDocs.map((d) => (
              <Link
                key={d.id}
                to={`/app/docs/${d.id}`}
                className="glass-card rounded-xl p-4 hover:shadow-md transition"
              >
                <div className="text-sm font-medium text-text-primary truncate">{d.title}</div>
                <div className="text-xs text-text-secondary mt-1">
                  {new Date(d.updatedAt).toLocaleString('zh-CN')}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
          <h2 className="text-xl font-bold font-serif">指定日期的待办</h2>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-black/10 bg-white/80 text-sm outline-none focus:border-liquid-indigo"
          />
        </div>
        <TodoList
          list={dayList.filter((t) => isSameDay(t.dueDate, selectedDate))}
          onToggle={toggleTodo}
          onRemove={removeTodo}
          emptyText={`${selectedDate} 暂无待办`}
        />
      </section>
    </div>
  );
}

function SummaryCard({
  title,
  icon: Icon,
  items,
  empty,
  moreTo,
}: {
  title: string;
  icon: typeof Calendar;
  items: { key: string; title: string; sub?: string; to?: string }[];
  empty: string;
  moreTo?: string;
}) {
  return (
    <div className="glass-card rounded-2xl p-5 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-liquid-indigo/10 text-liquid-indigo flex items-center justify-center">
            <Icon size={14} />
          </span>
          <span className="text-sm font-semibold text-text-primary">{title}</span>
        </div>
        {moreTo && (
          <Link to={moreTo} className="text-xs text-liquid-indigo hover:underline">
            查看更多
          </Link>
        )}
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-text-secondary py-4 text-center">{empty}</div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) =>
            it.to ? (
              <li key={it.key}>
                <Link
                  to={it.to}
                  className="block px-2 py-1.5 rounded-lg hover:bg-black/5 -mx-2"
                >
                  <div className="text-sm font-medium text-text-primary truncate">{it.title}</div>
                  {it.sub && <div className="text-xs text-text-secondary mt-0.5">{it.sub}</div>}
                </Link>
              </li>
            ) : (
              <li key={it.key} className="px-2 py-1.5 -mx-2">
                <div className="text-sm font-medium text-text-primary truncate">{it.title}</div>
                {it.sub && <div className="text-xs text-text-secondary mt-0.5">{it.sub}</div>}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function TodoList({
  list,
  onToggle,
  onRemove,
  emptyText = '今日还没有待办，添加一项开始吧',
}: {
  list: TodoItem[];
  onToggle: (id: string, completed: boolean) => void;
  onRemove: (id: string) => void;
  emptyText?: string;
}) {
  if (list.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-8 text-sm text-text-secondary text-center">
        {emptyText}
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {list.map((todo) => {
        const done = !!todo.completedAt;
        return (
          <li
            key={todo.id}
            className="glass-card rounded-xl p-4 flex items-center gap-3 group"
          >
            <button
              onClick={() => onToggle(todo.id, !done)}
              className={`shrink-0 ${done ? 'text-emerald-500' : 'text-text-secondary hover:text-liquid-indigo'} transition-colors`}
              aria-label={done ? '标记未完成' : '标记完成'}
            >
              {done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
            </button>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium ${done ? 'line-through text-text-secondary' : 'text-text-primary'}`}>
                {todo.title}
              </div>
              {todo.dueDate && (
                <div className="text-xs text-text-secondary mt-0.5">
                  {todo.dueDate.slice(0, 10)}
                </div>
              )}
            </div>
            <button
              onClick={() => onRemove(todo.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg text-text-secondary hover:bg-black/5 hover:text-red-500"
              aria-label="删除"
            >
              <Trash2 size={16} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
