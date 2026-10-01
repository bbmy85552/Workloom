import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCcw, RotateCcw, Trash2 } from 'lucide-react';
import { api, asApiError } from '../../lib/api';
import { useUiStore } from '../../store/ui';

interface TrashItem {
  id: string;
  title: string;
  workspaceId: string;
  parentId: string | null;
  deletedAt: string | null;
  remainDays: number;
  workspace?: { id: string; name: string; kind: string };
  deletedBy?: { id: string; email: string; name: string } | null;
  createdBy?: { id: string; email: string; name: string };
}

export function AdminTrashPage() {
  const showToast = useUiStore((s) => s.showToast);
  const confirmDialog = useUiStore((s) => s.confirmDialog);
  const [list, setList] = useState<TrashItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const pageSize = 20;

  const load = useCallback(
    async (p = page) => {
      setLoading(true);
      try {
        const { data } = await api.get<{ list: TrashItem[]; total: number; page: number }>(
          '/admin/trash',
          { params: { page: p, pageSize } },
        );
        setList(data.list);
        setTotal(data.total);
        setPage(data.page);
      } catch (err) {
        showToast(asApiError(err).error, 'error');
      } finally {
        setLoading(false);
      }
    },
    [page, showToast],
  );

  useEffect(() => {
    void load(1);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const restore = async (item: TrashItem) => {
    const ok = await confirmDialog({
      title: '恢复文档',
      message: `确认恢复文档「${item.title}」？将还原到其原位置。`,
      confirmText: '恢复',
    });
    if (!ok) return;
    try {
      await api.post(`/admin/trash/${item.id}/restore`);
      showToast('已恢复到原位置', 'success');
      void load(page);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const purge = async (item: TrashItem) => {
    const ok = await confirmDialog({
      title: '彻底删除',
      message: `确认彻底删除文档「${item.title}」？此操作不可恢复，文档及其版本、评论、附件将永久消失。`,
      confirmText: '彻底删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/admin/trash/${item.id}`);
      showToast('已彻底删除', 'success');
      void load(page);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  return (
    <div className="py-6 sm:py-8 animate-fade-in-up">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold text-text-primary">回收站</h1>
          <p className="text-text-secondary text-sm mt-1">
            公共知识库中被删除的文档，保留 30 天后自动清理
          </p>
        </div>
        <button
          onClick={() => load(page)}
          disabled={loading}
          className="flex items-center gap-1 px-3 h-9 rounded-lg border border-black/10 text-sm hover:bg-black/5 disabled:opacity-50"
        >
          <RefreshCcw size={14} /> 刷新
        </button>
      </header>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase text-text-secondary border-b border-black/5 bg-black/[0.02]">
            <tr>
              <th className="px-4 py-2">标题</th>
              <th className="px-4 py-2">删除人</th>
              <th className="px-4 py-2">删除时间</th>
              <th className="px-4 py-2">剩余保留</th>
              <th className="px-4 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {list.map((it) => (
              <tr key={it.id} className="border-b border-black/5">
                <td className="px-4 py-2 text-sm text-text-primary">
                  {it.title}
                  <div className="text-xs text-text-secondary">{`创建者：${it.createdBy?.name ?? '—'}`}</div>
                </td>
                <td className="px-4 py-2 text-sm text-text-secondary">
                  {it.deletedBy?.name ?? '—'}
                </td>
                <td className="px-4 py-2 text-xs text-text-secondary whitespace-nowrap">
                  {it.deletedAt ? new Date(it.deletedAt).toLocaleString() : '—'}
                </td>
                <td className="px-4 py-2 text-xs">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full ${
                      it.remainDays <= 3
                        ? 'bg-red-50 text-red-600'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {it.remainDays} 天
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      onClick={() => restore(it)}
                      title="恢复到原位置"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-liquid-indigo hover:bg-liquid-indigo/10"
                    >
                      <RotateCcw size={12} /> 恢复
                    </button>
                    <button
                      onClick={() => purge(it)}
                      title="彻底删除（不可恢复）"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-red-500 hover:bg-red-50"
                    >
                      <Trash2 size={12} /> 彻底删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-sm text-text-secondary">
                  回收站为空
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
