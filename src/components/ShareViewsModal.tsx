import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { api, asApiError } from '../lib/api';
import type { ShareLink } from '../lib/types';

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
