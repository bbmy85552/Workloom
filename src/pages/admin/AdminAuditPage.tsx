import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCcw } from 'lucide-react';
import { api, asApiError } from '../../lib/api';
import { useUiStore } from '../../store/ui';
import type { AuditLogItem } from '../../lib/types';

const ACTION_LABEL: Record<string, string> = {
  UPDATE_USER: '更新用户',
  RESET_PASSWORD: '重置密码',
  CREATE_USER: '创建用户',
  DELETE_USER: '删除用户',
  UPDATE_SETTINGS: '更新系统设置',
  RESTORE_DOC: '恢复文档',
  PURGE_DOC: '彻底删除文档',
};

export function AdminAuditPage() {
  const showToast = useUiStore((s) => s.showToast);
  const [list, setList] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = useCallback(
    async (p = page) => {
      try {
        const { data } = await api.get<{ list: AuditLogItem[]; total: number; page: number }>(
          '/admin/audit',
          { params: { page: p, pageSize } },
        );
        setList(data.list);
        setTotal(data.total);
        setPage(data.page);
      } catch (err) {
        showToast(asApiError(err).error, 'error');
      }
    },
    [page, showToast],
  );

  useEffect(() => {
    void load(1);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="py-6 sm:py-8 animate-fade-in-up">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold text-text-primary">审计日志</h1>
          <p className="text-text-secondary text-sm mt-1">追踪管理员操作历史</p>
        </div>
        <button
          onClick={() => load(page)}
          className="flex items-center gap-1 px-3 h-9 rounded-lg border border-black/10 text-sm hover:bg-black/5"
        >
          <RefreshCcw size={14} /> 刷新
        </button>
      </header>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase text-text-secondary border-b border-black/5 bg-black/[0.02]">
            <tr>
              <th className="px-4 py-2">时间</th>
              <th className="px-4 py-2">操作员</th>
              <th className="px-4 py-2">动作</th>
              <th className="px-4 py-2">对象</th>
              <th className="px-4 py-2">明细</th>
            </tr>
          </thead>
          <tbody>
            {list.map((it) => (
              <tr key={it.id} className="border-b border-black/5">
                <td className="px-4 py-2 text-xs text-text-secondary whitespace-nowrap">
                  {new Date(it.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-sm">{it.actor?.name ?? '—'}</td>
                <td className="px-4 py-2 text-xs">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-liquid-indigo/10 text-liquid-indigo">
                    {ACTION_LABEL[it.action] ?? it.action}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-text-secondary font-mono truncate max-w-xs">
                  {it.target}
                </td>
                <td className="px-4 py-2 text-xs text-text-secondary font-mono truncate max-w-md">
                  {it.metaJson}
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-sm text-text-secondary">
                  暂无日志
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-4 py-3 text-xs text-text-secondary border-t border-black/5">
          <span>
            共 {total} 条 · 第 {page} / {totalPages} 页
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => page > 1 && load(page - 1)}
              disabled={page <= 1}
              className="p-1 rounded hover:bg-black/5 disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => page < totalPages && load(page + 1)}
              disabled={page >= totalPages}
              className="p-1 rounded hover:bg-black/5 disabled:opacity-40"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
