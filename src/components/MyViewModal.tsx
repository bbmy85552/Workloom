import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { api, asApiError } from '../lib/api';
import { fmtSec, verdict } from './ShareViewsModal';

interface MySessionRow {
  id: string;
  visibleSec: number;
  activeSec: number;
  scrollSec: number;
  maxScrollDepth: number;
  startedAt: string;
  lastSeenAt: string;
  endedAt: string | null;
}

interface MineAgg {
  visits: number;
  visibleSec: number;
  activeSec: number;
  scrollSec: number;
  maxScrollDepth: number;
  lastSeenAt: string | null;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function MyViewModal({ linkId, title, onClose }: { linkId: string; title: string; onClose: () => void }) {
  const [mine, setMine] = useState<MineAgg | null>(null);
  const [sessions, setSessions] = useState<MySessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<{ mine: MineAgg; sessions: MySessionRow[] }>(`/share/views/${linkId}/mine`);
        if (!cancelled) {
          setMine(data.mine);
          setSessions(data.sessions);
        }
      } catch (err) {
        if (!cancelled) setError(asApiError(err).error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [linkId]);

  const v =
    mine && mine.visits > 0
      ? verdict({ activeSec: mine.activeSec, scrollSec: mine.scrollSec, maxScrollDepth: mine.maxScrollDepth })
      : null;

  return (
    <Modal open onClose={onClose} title="我的阅读" size="lg">
      <div className="max-h-[70dvh] space-y-4 overflow-y-auto p-4">
        <p className="truncate text-sm font-medium text-text-primary">{title || '未命名'}</p>
        {error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : !mine ? (
          <p className="text-sm text-text-secondary">加载中…</p>
        ) : mine.visits === 0 ? (
          <p className="text-sm text-text-secondary">暂无阅读记录，点开卡片阅读后这里会显示你的打开次数和阅读时长。</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {v && <span className={`rounded-full px-2 py-0.5 text-xs ${v.cls}`}>{v.label}</span>}
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl border border-black/5 px-3 py-2">
                <dt className="text-xs text-text-secondary">打开次数</dt>
                <dd className="font-medium text-text-primary">{mine.visits} 次</dd>
              </div>
              <div className="rounded-xl border border-black/5 px-3 py-2">
                <dt className="text-xs text-text-secondary">活跃时长</dt>
                <dd className="font-medium text-text-primary">{fmtSec(mine.activeSec)}</dd>
              </div>
              <div className="rounded-xl border border-black/5 px-3 py-2">
                <dt className="text-xs text-text-secondary">滚动时长</dt>
                <dd className="font-medium text-text-primary">{fmtSec(mine.scrollSec)}</dd>
              </div>
              <div className="rounded-xl border border-black/5 px-3 py-2">
                <dt className="text-xs text-text-secondary">最深滚动</dt>
                <dd className="font-medium text-text-primary">{mine.maxScrollDepth}%</dd>
              </div>
              <div className="col-span-2 rounded-xl border border-black/5 px-3 py-2">
                <dt className="text-xs text-text-secondary">最近打开</dt>
                <dd className="font-medium text-text-primary">{mine.lastSeenAt ? fmtDateTime(mine.lastSeenAt) : '—'}</dd>
              </div>
            </dl>
            <div className="space-y-2">
              {sessions.map((s, i) => {
                const sv = verdict({ activeSec: s.activeSec, scrollSec: s.scrollSec, maxScrollDepth: s.maxScrollDepth });
                return (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-black/5 px-3 py-2 text-xs text-text-secondary"
                  >
                    <span className="text-text-primary">第 {sessions.length - i} 次</span>
                    <span>{fmtDateTime(s.startedAt)}</span>
                    <span>活跃 {fmtSec(s.activeSec)}</span>
                    <span>滚动 {fmtSec(s.scrollSec)}</span>
                    <span>最深 {s.maxScrollDepth}%</span>
                    <span className={`rounded-full px-1.5 py-0.5 ${sv.cls}`}>{sv.label}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
