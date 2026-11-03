import { useEffect, useMemo, useState } from 'react';
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

export function ReadingStatsPage() {
  const showToast = useUiStore((s) => s.showToast);
  const [links, setLinks] = useState<ReadingLink[]>([]);
  const [linksLoaded, setLinksLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReadingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [companyFilter, setCompanyFilter] = useState('全部');
  const [unreadOnly, setUnreadOnly] = useState(false);

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
    <div className="py-6 sm:py-8 animate-fade-in-up">
      <header className="mb-6">
        <h1 className="text-3xl font-serif font-bold text-text-primary">阅读统计</h1>
        <p className="text-text-secondary text-sm mt-1">
          查看每篇文章的阅读情况，并为每位用户设置公司。
        </p>
      </header>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-3">文章列表</h2>
        <div className="glass-panel rounded-2xl overflow-hidden">
          {!linksLoaded && (
            <div className="py-10 text-center text-sm text-text-secondary">加载中…</div>
          )}
          {linksLoaded && links.length === 0 && (
            <div className="py-10 text-center text-sm text-text-secondary">
              还没有记录观看情况的分享链接。
            </div>
          )}
          {links.map((link) => {
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
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-3">逐人阅读情况</h2>
        {selectedLink && (
          <div className="text-sm text-text-secondary mb-3">
            {typeLabel(selectedLink.resourceType)} · {detail?.link.title ?? selectedLink.title}
          </div>
        )}
        <div className="glass-panel rounded-2xl overflow-hidden">
          {detailLoading && (
            <div className="py-10 text-center text-sm text-text-secondary">加载中…</div>
          )}
          {!detailLoading && !detail && (
            <div className="py-10 text-center text-sm text-text-secondary">
              还没有记录观看情况的分享链接。
            </div>
          )}
          {detail && (
            <>
              <div className="flex items-center gap-3 flex-wrap px-4 py-3 border-b border-black/5">
                <select
                  value={companyFilter}
                  onChange={(e) => setCompanyFilter(e.target.value)}
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
                    onChange={(e) => setUnreadOnly(e.target.checked)}
                  />
                  只看未读
                </label>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase text-text-secondary border-b border-black/5 bg-black/[0.02]">
                    <tr>
                      <th className="px-4 py-2">姓名</th>
                      <th className="px-4 py-2">公司</th>
                      <th className="px-4 py-2">打开次数</th>
                      <th className="px-4 py-2">可见时长</th>
                      {!isHtml && <th className="px-4 py-2">活跃时长</th>}
                      {!isHtml && <th className="px-4 py-2">滚动时长</th>}
                      {!isHtml && <th className="px-4 py-2">最深滚动</th>}
                      <th className="px-4 py-2">最近打开</th>
                      {!isHtml && <th className="px-4 py-2">判定</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => {
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
              </div>
            </>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-text-primary mb-3">人员公司设置</h2>
        <p className="text-text-secondary text-sm mb-3">
          输入公司名称，按回车或点击别处保存
        </p>
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-text-secondary border-b border-black/5 bg-black/[0.02]">
                <tr>
                  <th className="px-4 py-2">姓名</th>
                  <th className="px-4 py-2">邮箱</th>
                  <th className="px-4 py-2">角色</th>
                  <th className="px-4 py-2">公司</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
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
        </div>
      </section>
    </div>
  );
}
