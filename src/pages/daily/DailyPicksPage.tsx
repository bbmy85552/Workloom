import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, Eye, FileText, Plus, RefreshCw, Sparkles, Table as TableIcon, X } from 'lucide-react';
import { api, asApiError } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import { useUiStore } from '../../store/ui';
import type { ShareLink } from '../../lib/types';
import { Modal } from '../../components/Modal';
import { ShareViewsModal } from '../../components/ShareViewsModal';
import { MyViewModal } from '../../components/MyViewModal';

interface DailyPickItem {
  id: string;
  featuredDate: string;
  sortOrder: number;
  linkId: string;
  token: string;
  resourceType: 'doc' | 'table';
  resourceId: string;
  title: string;
  createdByName: string;
  linkCreatedAt: string;
  expiresAt: string | null;
  canViewStats: boolean;
}

interface AvailableLink {
  linkId: string;
  token: string;
  resourceType: 'doc' | 'table';
  resourceId: string;
  title: string;
  createdByName: string;
  linkCreatedAt: string;
}

const TYPE_LABEL: Record<string, string> = { doc: '文档', table: '数据表' };

const shanghaiDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function todayShanghai(): string {
  return shanghaiDay.format(new Date());
}

function currentLocale(): string {
  if (typeof document === 'undefined') return 'zh-CN';
  const lang = document.documentElement.dataset.language;
  if (lang === 'en') return 'en-US';
  if (lang === 'zh-HK') return 'zh-HK';
  return 'zh-CN';
}

function fmtDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00+08:00`);
  return d.toLocaleDateString(currentLocale(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: 'Asia/Shanghai',
  });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(currentLocale(), { hour12: false, timeZone: 'Asia/Shanghai' });
}

export function DailyPicksPage() {
  const showToast = useUiStore((s) => s.showToast);
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'ADMIN';
  const [items, setItems] = useState<DailyPickItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [available, setAvailable] = useState<AvailableLink[]>([]);
  const [adding, setAdding] = useState(false);
  const [statsItem, setStatsItem] = useState<DailyPickItem | null>(null);
  const [myStatsItem, setMyStatsItem] = useState<DailyPickItem | null>(null);
  const [pendingRemove, setPendingRemove] = useState<DailyPickItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ list: DailyPickItem[] }>('/daily-picks');
      setItems(data.list);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const map = new Map<string, DailyPickItem[]>();
    for (const item of items) {
      const arr = map.get(item.featuredDate) ?? [];
      arr.push(item);
      map.set(item.featuredDate, arr);
    }
    return [...map.entries()];
  }, [items]);

  const changeDate = async (item: DailyPickItem, date: string) => {
    if (!date || date === item.featuredDate) return;
    try {
      await api.patch(`/daily-picks/${item.id}`, { featuredDate: date });
      showToast('已调整日期', 'success');
      void load();
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const move = async (item: DailyPickItem, direction: 'up' | 'down') => {
    try {
      const { data } = await api.post<{ moved: boolean }>(`/daily-picks/${item.id}/move`, { direction });
      if (data.moved) void load();
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const remove = async (item: DailyPickItem) => {
    try {
      await api.delete(`/daily-picks/${item.id}`);
      showToast('已从时间线移出', 'success');
      setPendingRemove(null);
      void load();
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const loadAvailable = async () => {
    try {
      const { data } = await api.get<{ list: AvailableLink[] }>('/daily-picks/available');
      setAvailable(data.list);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const openAdd = () => {
    setShowAdd(true);
    void loadAvailable();
  };

  const addOne = async (link: AvailableLink) => {
    setAdding(true);
    try {
      await api.post('/daily-picks', { shareLinkId: link.linkId });
      showToast('已加入时间线', 'success');
      void loadAvailable();
      void load();
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      setAdding(false);
    }
  };

  const statsLink: ShareLink | null = statsItem
    ? {
        id: statsItem.linkId,
        token: statsItem.token,
        resourceType: statsItem.resourceType,
        resourceId: statsItem.resourceId,
        role: 'view',
        requireLogin: true,
        trackViews: true,
        expiresAt: statsItem.expiresAt,
        createdAt: statsItem.linkCreatedAt,
        revokedAt: null,
        createdBy: { id: '', name: statsItem.createdByName, email: '' },
      }
    : null;

  const today = todayShanghai();

  return (
    <div className="animate-fade-in-up py-6 sm:py-8">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif font-bold text-text-primary tracking-tight mb-1 flex items-center gap-2">
            <Sparkles size={26} className="text-liquid-indigo" />
            每日精选
          </h1>
          <p className="text-text-secondary text-sm">
            每天精选的 AI 知识。点开卡片会在新标签页打开分享文章，阅读时长和滚动会被记录下来。
            {isAdmin && '管理员可以在这里调整每篇的日期和顺序。'}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {isAdmin && (
            <button
              onClick={openAdd}
              className="px-3 py-1.5 rounded-lg bg-liquid-indigo text-white text-sm inline-flex items-center gap-1"
            >
              <Plus size={14} /> 添加已有记录链接
            </button>
          )}
          <button
            onClick={load}
            className="px-3 py-1.5 rounded-lg border border-black/10 text-sm text-text-secondary hover:bg-black/5 inline-flex items-center gap-1"
          >
            <RefreshCw size={14} /> 刷新
          </button>
        </div>
      </header>

      {loading ? (
        <div className="glass-card rounded-2xl p-8 text-sm text-text-secondary text-center">加载中…</div>
      ) : items.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-sm text-text-secondary text-center">
          还没有每日精选。分享文章时勾选「记录观看情况」，它就会自动出现在这里。
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(([date, group]) => (
            <section key={date}>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full bg-liquid-indigo" />
                <h2 className="text-base font-semibold text-text-primary">{fmtDate(date)}</h2>
                {date === today && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-liquid-indigo/10 text-liquid-indigo">今天</span>
                )}
              </div>
              <ul className="space-y-2">
                {group.map((item, idx) => {
                  const Icon = item.resourceType === 'doc' ? FileText : TableIcon;
                  return (
                    <li key={item.id} className="glass-card rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3">
                        <a
                          href={`/share/${item.token}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 min-w-0 flex items-center gap-3"
                        >
                          <span className="w-8 h-8 shrink-0 rounded-lg bg-liquid-indigo/10 text-liquid-indigo flex items-center justify-center">
                            <Icon size={16} />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-medium text-text-primary truncate">{item.title || '未命名'}</span>
                            <span className="block text-xs text-text-secondary mt-0.5">
                              {`${TYPE_LABEL[item.resourceType]} · 分享者 ${item.createdByName} · 分享于 ${fmtDateTime(item.linkCreatedAt)} · 记录观看`}
                            </span>
                          </span>
                        </a>
                        {item.canViewStats && (
                          <button
                            onClick={() => setStatsItem(item)}
                            className="shrink-0 px-2 py-1.5 rounded-lg border border-black/10 text-xs text-text-secondary hover:bg-black/5 inline-flex items-center gap-1"
                            title="查看记录"
                          >
                            <Eye size={13} /> 查看记录
                          </button>
                        )}
                        <button
                          onClick={() => setMyStatsItem(item)}
                          className="shrink-0 px-2 py-1.5 rounded-lg border border-black/10 text-xs text-text-secondary hover:bg-black/5 inline-flex items-center gap-1"
                          title="我的阅读"
                        >
                          <BookOpen size={13} /> 我的阅读
                        </button>
                      </div>
                      {isAdmin && (
                        <div className="mt-3 pt-3 border-t border-black/5 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                          <label className="inline-flex items-center gap-1">
                            日期
                            <input
                              type="date"
                              value={item.featuredDate}
                              onChange={(e) => void changeDate(item, e.target.value)}
                              className="px-2 py-1 rounded-lg border border-black/10 bg-white text-text-primary"
                            />
                          </label>
                          <button
                            onClick={() => void move(item, 'up')}
                            disabled={idx === 0}
                            className="px-2 py-1.5 rounded-lg border border-black/10 hover:bg-black/5 inline-flex items-center gap-1 disabled:opacity-40"
                          >
                            <ChevronUp size={13} /> 上移
                          </button>
                          <button
                            onClick={() => void move(item, 'down')}
                            disabled={idx === group.length - 1}
                            className="px-2 py-1.5 rounded-lg border border-black/10 hover:bg-black/5 inline-flex items-center gap-1 disabled:opacity-40"
                          >
                            <ChevronDown size={13} /> 下移
                          </button>
                          <button
                            onClick={() => setPendingRemove(item)}
                            className="px-2 py-1.5 rounded-lg border border-black/10 text-danger hover:bg-black/5 inline-flex items-center gap-1"
                          >
                            <X size={13} /> 移出时间线
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="添加已有记录链接" size="lg">
        <div className="p-4 space-y-2 max-h-[70dvh] overflow-y-auto">
          <p className="text-xs text-text-secondary">
            只列出勾选了「记录观看情况」的仅查看分享链接，且尚未进入时间线的。加入后默认归到链接创建那一天，之后可以在时间线里改日期。
          </p>
          {available.length === 0 ? (
            <div className="text-sm text-text-secondary text-center py-6">没有可加入的记录链接</div>
          ) : (
            available.map((link) => (
              <div key={link.linkId} className="flex items-center gap-3 rounded-xl border border-black/5 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text-primary truncate">{link.title || '未命名'}</div>
                  <div className="text-xs text-text-secondary mt-0.5">
                    {`${TYPE_LABEL[link.resourceType]} · 分享者 ${link.createdByName} · 分享于 ${fmtDateTime(link.linkCreatedAt)}`}
                  </div>
                </div>
                <button
                  onClick={() => void addOne(link)}
                  disabled={adding}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-liquid-indigo text-white text-xs disabled:opacity-50"
                >
                  加入时间线
                </button>
              </div>
            ))
          )}
        </div>
      </Modal>

      <Modal open={pendingRemove !== null} onClose={() => setPendingRemove(null)} title="移出时间线" size="sm">
        <div className="p-4 space-y-4">
          <p className="text-sm text-text-secondary">确定把这篇从时间线移出吗？分享链接本身不会被撤销。</p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setPendingRemove(null)}
              className="px-3 py-1.5 rounded-lg border border-black/10 text-sm text-text-secondary hover:bg-black/5"
            >
              取消
            </button>
            <button
              onClick={() => pendingRemove && void remove(pendingRemove)}
              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm"
            >
              移出时间线
            </button>
          </div>
        </div>
      </Modal>

      {statsLink && <ShareViewsModal link={statsLink} onClose={() => setStatsItem(null)} />}
      {myStatsItem && <MyViewModal linkId={myStatsItem.linkId} title={myStatsItem.title} onClose={() => setMyStatsItem(null)} />}
    </div>
  );
}
