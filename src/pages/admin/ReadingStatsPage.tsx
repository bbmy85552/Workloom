import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api, asApiError } from '../../lib/api';
import { useUiStore } from '../../store/ui';
import type { AdminUser } from '../../lib/types';
import { fmtSec, verdict } from '../../components/ShareViewsModal';

interface ReadingLink {
  id: string;
  token: string;
  resourceType: string;
  resourceId: string;
  title: string;
  creatorName: string;
  createdAt: string;
  readers: number;
  totalUsers: number;
}

interface ReadingAgg {
  visits: number;
  visibleSec: number;
  activeSec: number;
  scrollSec: number;
  maxScrollDepth: number;
  lastSeenAt: string;
}

interface ReadingUserRow {
  id: string;
  name: string;
  email: string;
  company: string | null;
  agg: ReadingAgg | null;
}

interface ReadingDetail {
  link: {
    id: string;
    token: string;
    resourceType: string;
    resourceId: string;
    title: string;
    creatorName: string;
    createdAt: string;
  };
  users: ReadingUserRow[];
}

interface UsersPage {
  list: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
}

function typeLabel(resourceType: string): string {
  if (resourceType === 'table') return '数据表';
  if (resourceType === 'html') return 'HTML';
  return '文档';
}

const PAGE_SIZE = 10;

function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={() => page > 1 && onPage(page - 1)}
        disabled={page <= 1}
        className="p-1 rounded hover:bg-black/5 disabled:opacity-40"
        aria-label="上一页"
      >
        <ChevronLeft size={14} />
      </button>
      <button
        type="button"
        onClick={() => page < totalPages && onPage(page + 1)}
        disabled={page >= totalPages}
        className="p-1 rounded hover:bg-black/5 disabled:opacity-40"
        aria-label="下一页"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

export function ReadingStatsPage() {
  const showToast = useUiStore((s) => s.showToast);
  const [tab, setTab] = useState<'reading' | 'companies'>('reading');
  const [links, setLinks] = useState<ReadingLink[]>([]);
  const [linksLoaded, setLinksLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReadingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [companyFilter, setCompanyFilter] = useState('全部');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [linksPage, setLinksPage] = useState(1);
  const [detailPage, setDetailPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get<{ list: ReadingLink[] }>('/admin/reading/links');
        setLinks(data.list);
        setSelectedId((prev) => prev ?? data.list[0]?.id ?? null);
      } catch (err) {
        showToast(asApiError(err).error, 'error');
      } finally {
        setLinksLoaded(true);
      }
    })();
  }, [showToast]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetail(null);
    setDetailLoading(true);
    setCompanyFilter('全部');
    setUnreadOnly(false);
    setDetailPage(1);
    (async () => {
      try {
        const { data } = await api.get<ReadingDetail>(`/admin/reading/${selectedId}`);
        setDetail(data);
      } catch (err) {
        showToast(asApiError(err).error, 'error');
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [selectedId, showToast]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get<UsersPage>('/admin/users', {
          params: { page: 1, pageSize: 100 },
        });
        setUsers(data.list);
        setDrafts(Object.fromEntries(data.list.map((u) => [u.id, u.company ?? ''])));
      } catch (err) {
        showToast(asApiError(err).error, 'error');
      }
    })();
  }, [showToast]);

  const selectedLink = links.find((l) => l.id === selectedId) ?? null;
  const isHtml = detail
    ? detail.link.resourceType === 'html'
    : selectedLink?.resourceType === 'html';

  const companies = useMemo(() => {
    if (!detail) return [];
    const set = new Set<string>();
    for (const u of detail.users) if (u.company) set.add(u.company);
    return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [detail]);

  const filteredUsers = useMemo(() => {
    if (!detail) return [];
    return detail.users.filter((u) => {
      if (companyFilter !== '全部' && u.company !== companyFilter) return false;
      if (unreadOnly && u.agg !== null) return false;
      return true;
    });
  }, [detail, companyFilter, unreadOnly]);

  const linksTotalPages = Math.max(1, Math.ceil(links.length / PAGE_SIZE));
  const linksPageSafe = Math.min(linksPage, linksTotalPages);
  const pageLinks = links.slice((linksPageSafe - 1) * PAGE_SIZE, linksPageSafe * PAGE_SIZE);

  const detailTotalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const detailPageSafe = Math.min(detailPage, detailTotalPages);
  const pageDetailUsers = filteredUsers.slice(
    (detailPageSafe - 1) * PAGE_SIZE,
    detailPageSafe * PAGE_SIZE,
  );
  const readCount = filteredUsers.filter((u) => u.agg !== null).length;
  const unreadCount = filteredUsers.length - readCount;

  const usersTotalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const usersPageSafe = Math.min(usersPage, usersTotalPages);
  const pageUsers = users.slice((usersPageSafe - 1) * PAGE_SIZE, usersPageSafe * PAGE_SIZE);

  const saveCompany = async (u: AdminUser) => {
    const draft = drafts[u.id] ?? '';
    const next = draft.trim() ? draft.trim() : null;
    if (next === (u.company ?? null)) {
      setDrafts((prev) => ({ ...prev, [u.id]: u.company ?? '' }));
      return;
    }
    try {
      const { data } = await api.patch<{ user: AdminUser }>(`/admin/users/${u.id}/company`, {
        company: next,
      });
      showToast('已保存', 'success');
      setUsers((prev) => prev.map((x) => (x.id === u.id ? data.user : x)));
      setDrafts((prev) => ({ ...prev, [u.id]: data.user.company ?? '' }));
    } catch (err) {
      showToast(asApiError(err).error, 'error');
      setDrafts((prev) => ({ ...prev, [u.id]: u.company ?? '' }));
    }
  };

  return (
    <div className="h-full flex flex-col animate-fade-in-up md:h-[calc(100dvh-3rem)]">
      <header className="shrink-0 mb-3">
        <h1 className="text-3xl font-serif font-bold text-text-primary">阅读统计</h1>
        <p className="text-text-secondary text-sm mt-1">
          查看每篇文章的阅读情况，并为每位用户设置公司。
        </p>
      </header>

      <div className="shrink-0 flex gap-1 border-b border-black/5 mb-3" role="tablist" aria-label="阅读统计">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'reading'}
          onClick={() => setTab('reading')}
          className={`px-3 py-2 text-sm -mb-px border-b-2 transition-colors ${
            tab === 'reading'
              ? 'border-liquid-indigo text-liquid-indigo font-semibold'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          阅读情况
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'companies'}
          onClick={() => setTab('companies')}
          className={`px-3 py-2 text-sm -mb-px border-b-2 transition-colors ${
            tab === 'companies'
              ? 'border-liquid-indigo text-liquid-indigo font-semibold'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          人员公司设置
        </button>
      </div>

      {tab === 'reading' ? (
        <div className="flex-1 min-h-0 flex flex-col gap-4 lg:flex-row">
          <section className="glass-panel rounded-2xl overflow-hidden flex flex-col min-h-0 w-full shrink-0 lg:w-[320px]">
            <div className="shrink-0 px-4 py-3 border-b border-black/5 text-sm font-semibold text-text-primary">
              文章列表
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {!linksLoaded && (
                <div className="py-10 text-center text-sm text-text-secondary">加载中…</div>
              )}
              {linksLoaded && links.length === 0 && (
                <div className="py-10 text-center text-sm text-text-secondary">
                  还没有记录观看情况的分享链接。
                </div>
              )}
              {pageLinks.map((link) => {
                const active = link.id === selectedId;
                return (
                  <button
                    key={link.id}
                    type="button"
                    onClick={() => setSelectedId(link.id)}
                    className={`w-full text-left px-4 py-3 border-b border-black/5 last:border-b-0 hover:bg-black/[0.02] ${
                      active ? 'bg-liquid-indigo/10' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-full bg-black/5 text-xs text-text-secondary">
                        {typeLabel(link.resourceType)}
                      </span>
                      <span className="font-medium text-text-primary text-sm">{link.title}</span>
                    </div>
                    <div className="text-xs text-text-secondary mt-1">
                      创建人 {link.creatorName} · 创建日期{' '}
                      {new Date(link.createdAt).toLocaleDateString()} · 已读 {link.readers} / 共{' '}
                      {link.totalUsers} 人
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="shrink-0 flex items-center justify-between px-4 py-3 text-xs text-text-secondary border-t border-black/5">
              <span>{`共 ${links.length} 篇 · 第 ${linksPageSafe} / ${linksTotalPages} 页`}</span>
              <Pager page={linksPageSafe} totalPages={linksTotalPages} onPage={setLinksPage} />
            </div>
          </section>

          <section className="glass-panel rounded-2xl overflow-hidden flex flex-col min-h-0 flex-1 min-w-0">
            <div className="shrink-0 px-4 py-3 border-b border-black/5">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  {selectedLink ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-black/5 text-xs text-text-secondary">
                        {typeLabel(selectedLink.resourceType)}
                      </span>
                      <span className="truncate font-medium text-text-primary text-sm">
                        {detail?.link.title ?? selectedLink.title}
                      </span>
                    </div>
                  ) : (
                    <div className="font-medium text-text-primary text-sm">逐人阅读情况</div>
                  )}
                </div>
                {detail && (
                  <>
                    <select
                      value={companyFilter}
                      onChange={(e) => {
                        setCompanyFilter(e.target.value);
                        setDetailPage(1);
                      }}
                      className="h-8 px-2 text-sm rounded-md border border-black/10 bg-white"
                      aria-label="公司"
                    >
                      <option value="全部">全部</option>
                      {companies.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-sm text-text-primary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={unreadOnly}
                        onChange={(e) => {
                          setUnreadOnly(e.target.checked);
                          setDetailPage(1);
                        }}
                      />
                      只看未读
                    </label>
                  </>
                )}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {detailLoading && (
                <div className="py-10 text-center text-sm text-text-secondary">加载中…</div>
              )}
              {!detailLoading && !detail && (
                <div className="py-10 text-center text-sm text-text-secondary">
                  还没有记录观看情况的分享链接。
                </div>
              )}
              {detail && (
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase text-text-secondary border-b border-black/5">
                    <tr>
                      <th className="px-4 py-2 sticky top-0 z-10 bg-surface-container-lowest">姓名</th>
                      <th className="px-4 py-2 sticky top-0 z-10 bg-surface-container-lowest">公司</th>
                      <th className="px-4 py-2 sticky top-0 z-10 bg-surface-container-lowest">打开次数</th>
                      <th className="px-4 py-2 sticky top-0 z-10 bg-surface-container-lowest">可见时长</th>
                      {!isHtml && <th className="px-4 py-2 sticky top-0 z-10 bg-surface-container-lowest">活跃时长</th>}
                      {!isHtml && <th className="px-4 py-2 sticky top-0 z-10 bg-surface-container-lowest">滚动时长</th>}
                      {!isHtml && <th className="px-4 py-2 sticky top-0 z-10 bg-surface-container-lowest">最深滚动</th>}
                      <th className="px-4 py-2 sticky top-0 z-10 bg-surface-container-lowest">最近打开</th>
                      {!isHtml && <th className="px-4 py-2 sticky top-0 z-10 bg-surface-container-lowest">判定</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pageDetailUsers.map((u) => {
                      const vd = u.agg ? verdict(u.agg) : null;
                      return (
                        <tr key={u.id} className="border-b border-black/5 hover:bg-black/[0.02]">
                          <td className="px-4 py-2">
                            <div className="font-medium text-text-primary text-sm">{u.name}</div>
                            <div className="text-xs text-text-secondary">{u.email}</div>
                            {isHtml && !u.agg && (
                              <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-black/5 text-text-secondary text-xs">
                                未看
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-xs text-text-secondary">
                            {u.company ?? '—'}
                          </td>
                          <td className="px-4 py-2">{u.agg ? u.agg.visits : '—'}</td>
                          <td className="px-4 py-2">
                            {u.agg ? fmtSec(u.agg.visibleSec) : '—'}
                          </td>
                          {!isHtml && (
                            <td className="px-4 py-2">
                              {u.agg ? fmtSec(u.agg.activeSec) : '—'}
                            </td>
                          )}
                          {!isHtml && (
                            <td className="px-4 py-2">
                              {u.agg ? fmtSec(u.agg.scrollSec) : '—'}
                            </td>
                          )}
                          {!isHtml && (
                            <td className="px-4 py-2">
                              {u.agg ? `${u.agg.maxScrollDepth}%` : '—'}
                            </td>
                          )}
                          <td className="px-4 py-2 text-xs text-text-secondary whitespace-nowrap">
                            {u.agg ? new Date(u.agg.lastSeenAt).toLocaleString() : '—'}
                          </td>
                          {!isHtml && (
                            <td className="px-4 py-2">
                              {vd ? (
                                <span className={`px-2 py-0.5 rounded-full text-xs ${vd.cls}`}>
                                  {vd.label}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-black/5 text-text-secondary text-xs">
                                  未看
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td
                          colSpan={isHtml ? 5 : 9}
                          className="py-10 text-center text-sm text-text-secondary"
                        >
                          暂无用户
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            {detail && (
              <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 text-xs text-text-secondary border-t border-black/5">
                <span className="truncate">{`共 ${filteredUsers.length} 人 · 已读 ${readCount} · 未读 ${unreadCount}`}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <span>{`第 ${detailPageSafe} / ${detailTotalPages} 页`}</span>
                  <Pager page={detailPageSafe} totalPages={detailTotalPages} onPage={setDetailPage} />
                </div>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <section className="glass-panel rounded-2xl overflow-hidden flex flex-col min-h-0 flex-1">
            <div className="shrink-0 px-4 py-3 border-b border-black/5 text-sm text-text-secondary">
              输入公司名称，按回车或点击别处保存
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase text-text-secondary border-b border-black/5">
                  <tr>
                    <th className="px-4 py-2 sticky top-0 z-10 bg-surface-container-lowest">姓名</th>
                    <th className="px-4 py-2 sticky top-0 z-10 bg-surface-container-lowest">邮箱</th>
                    <th className="px-4 py-2 sticky top-0 z-10 bg-surface-container-lowest">角色</th>
                    <th className="px-4 py-2 sticky top-0 z-10 bg-surface-container-lowest">公司</th>
                  </tr>
                </thead>
                <tbody>
                  {pageUsers.map((u) => (
                    <tr key={u.id} className="border-b border-black/5 hover:bg-black/[0.02]">
                      <td className="px-4 py-2 font-medium text-text-primary text-sm">{u.name}</td>
                      <td className="px-4 py-2 text-xs text-text-secondary">{u.email}</td>
                      <td className="px-4 py-2 text-xs">
                        {u.role === 'ADMIN' ? '管理员' : '普通用户'}
                      </td>
                      <td className="px-4 py-2">
                        <input
                          value={drafts[u.id] ?? ''}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [u.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                          }}
                          onBlur={() => void saveCompany(u)}
                          className="w-full h-8 px-2 text-sm rounded-md border border-black/10 bg-white outline-none focus:border-liquid-indigo focus:ring-2 focus:ring-liquid-indigo/15"
                        />
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-sm text-text-secondary">
                        暂无用户
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="shrink-0 flex items-center justify-between px-4 py-3 text-xs text-text-secondary border-t border-black/5">
              <span>{`共 ${users.length} 人 · 第 ${usersPageSafe} / ${usersTotalPages} 页`}</span>
              <Pager page={usersPageSafe} totalPages={usersTotalPages} onPage={setUsersPage} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
