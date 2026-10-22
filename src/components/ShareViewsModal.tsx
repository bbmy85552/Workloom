import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { api, asApiError } from '../lib/api';
import type { ShareLink, UserSearchItem } from '../lib/types';
import { X } from 'lucide-react';
import { UserPicker } from './UserPicker';
import { useUiStore } from '../store/ui';

interface ViewerUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}
interface ViewerAgg {
  user: ViewerUser;
  visits: number;
  visibleSec: number;
  activeSec: number;
  scrollSec: number;
  maxScrollDepth: number;
  lastSeenAt: string;
}
interface ViewSessionRow {
  id: string;
  user: ViewerUser;
  visibleSec: number;
  activeSec: number;
  scrollSec: number;
  maxScrollDepth: number;
  startedAt: string;
  lastSeenAt: string;
  endedAt: string | null;
}
interface ViewsData {
  summary: { viewers: number; visits: number; avgActiveSec: number };
  byUser: ViewerAgg[];
  sessions: ViewSessionRow[];
  canManageViewers?: boolean;
}

function fmtSec(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m} 分 ${rest} 秒` : `${m} 分钟`;
}

function verdict(v: { activeSec: number; scrollSec: number; maxScrollDepth: number }): {
  label: string;
  cls: string;
} {
  if (v.maxScrollDepth >= 90 && v.activeSec >= 10)
    return { label: '已读完', cls: 'bg-emerald-50 text-emerald-700' };
  if (v.activeSec >= 20 && v.maxScrollDepth >= 30)
    return { label: '认真阅读', cls: 'bg-indigo-50 text-liquid-indigo' };
  if (v.activeSec >= 8 || v.scrollSec >= 3)
    return { label: '浏览过', cls: 'bg-amber-50 text-amber-700' };
  return { label: '打开未看', cls: 'bg-red-50 text-danger' };
}

export function ShareViewsModal({ link, onClose }: { link: ShareLink; onClose: () => void }) {
  const [data, setData] = useState<ViewsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewers, setViewers] = useState<ViewerUser[]>([]);
  const showToast = useUiStore((s) => s.showToast);

  const loadViewers = async () => {
    try {
      const res = await api.get<{ viewers: ViewerUser[] }>(`/share/views/${link.id}/viewers`);
      setViewers(res.data.viewers);
    } catch {
      /* 无管理权时静默 */
    }
  };

  useEffect(() => {
    if (data?.canManageViewers) void loadViewers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.canManageViewers, link.id]);

  const addViewer = async (u: UserSearchItem) => {
    try {
      await api.post(`/share/views/${link.id}/viewers`, { userId: u.id });
      setViewers((arr) => [
        ...arr,
        { id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl ?? null },
      ]);
      showToast(`已指定 ${u.name} 可查看`, 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const removeViewer = async (userId: string) => {
    try {
      await api.delete(`/share/views/${link.id}/viewers/${userId}`);
      setViewers((arr) => arr.filter((v) => v.id !== userId));
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<ViewsData>(`/share/views/${link.id}`);
        setData(res.data);
      } catch (err) {
        setError(asApiError(err).error);
      }
    })();
  }, [link.id]);

  return (
    <Modal open onClose={onClose} title="观看记录" size="lg">
      {error && <div className="text-sm text-danger py-4">{error}</div>}
      {!data && !error && <div className="text-sm text-text-secondary py-4">加载中…</div>}
      {data && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-black/5">观看人数 {data.summary.viewers}</span>
            <span className="px-2.5 py-1 rounded-full bg-black/5">打开次数 {data.summary.visits}</span>
            <span className="px-2.5 py-1 rounded-full bg-black/5">
              平均认真阅读 {fmtSec(data.summary.avgActiveSec)}
            </span>
          </div>
          {data.canManageViewers && (
            <div className="rounded-xl border border-black/5 p-3 space-y-2">
              <div className="text-xs font-medium text-text-primary">可查看此数据的人</div>
              <div className="text-[11px] text-text-secondary">
                链接创建者、文章作者、管理员默认可看；在这里可以再指定其他已登录用户查看这条链接的观看数据。
              </div>
              <div className="flex flex-wrap gap-1.5">
                {viewers.map((u) => (
                  <span
                    key={u.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-liquid-indigo/10 text-liquid-indigo text-[11px]"
                  >
                    {u.name}
                    <button
                      onClick={() => void removeViewer(u.id)}
                      className="hover:text-danger"
                      title="移除"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
                {viewers.length === 0 && (
                  <span className="text-[11px] text-text-secondary">尚未指定其他人</span>
                )}
              </div>
              <UserPicker
                placeholder="输入姓名或邮箱，指定可查看的人…"
                excludeIds={viewers.map((v) => v.id)}
                onPick={(u) => void addViewer(u)}
              />
            </div>
          )}
          {data.byUser.length === 0 ? (
            <div className="text-sm text-text-secondary py-2">还没有人打开过这条链接。</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left text-text-secondary border-b border-black/5">
                    <th className="py-2 pr-3 font-medium">观看者</th>
                    <th className="py-2 pr-3 font-medium">次数</th>
                    <th className="py-2 pr-3 font-medium">认真阅读</th>
                    <th className="py-2 pr-3 font-medium">停留（可见）</th>
                    <th className="py-2 pr-3 font-medium">滚动时长</th>
                    <th className="py-2 pr-3 font-medium">最深滚动</th>
                    <th className="py-2 pr-3 font-medium">最近打开</th>
                    <th className="py-2 font-medium">判定</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byUser.map((v) => {
                    const vd = verdict(v);
                    return (
                      <tr key={v.user.id} className="border-b border-black/5">
                        <td className="py-2 pr-3">
                          <div className="font-medium text-text-primary">{v.user.name}</div>
                          <div className="text-text-secondary">{v.user.email}</div>
                        </td>
                        <td className="py-2 pr-3">{v.visits}</td>
                        <td className="py-2 pr-3">{fmtSec(v.activeSec)}</td>
                        <td className="py-2 pr-3">{fmtSec(v.visibleSec)}</td>
                        <td className="py-2 pr-3">{fmtSec(v.scrollSec)}</td>
                        <td className="py-2 pr-3">{v.maxScrollDepth}%</td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {new Date(v.lastSeenAt).toLocaleString()}
                        </td>
                        <td className="py-2">
                          <span className={`px-2 py-0.5 rounded-full ${vd.cls}`}>{vd.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {data.sessions.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                打开明细
              </div>
              <ul className="space-y-1.5 text-xs text-text-secondary">
                {data.sessions.slice(0, 30).map((s) => {
                  const vd = verdict(s);
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span className="text-text-primary font-medium">{s.user.name}</span>
                      <span>{new Date(s.startedAt).toLocaleString()}</span>
                      <span>认真阅读 {fmtSec(s.activeSec)}</span>
                      <span>
                        滚动 {fmtSec(s.scrollSec)} · 最深 {s.maxScrollDepth}%
                      </span>
                      <span className={`px-2 py-0.5 rounded-full ${vd.cls}`}>{vd.label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <p className="text-[11px] text-text-secondary">
            说明：认真阅读＝页面在前台、且 30 秒内有滑动或操作的时间；切去别的标签页、挂后台都不计入。判定仅供参考。
          </p>
        </div>
      )}
    </Modal>
  );
}
