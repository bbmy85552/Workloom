import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, Trash2 } from 'lucide-react';
import { api, asApiError } from '../../lib/api';
import { useUiStore } from '../../store/ui';

interface TrashItem {
  id: string;
  kind?: 'doc' | 'html';
  title: string;
  deletedAt: string | null;
  createdById: string;
  workspace: { id: string; name: string; kind: string } | null;
  createdBy: { id: string; name: string } | null;
}

export function UserTrashPage() {
  const [list, setList] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const showToast = useUiStore((s) => s.showToast);
  const confirmDialog = useUiStore((s) => s.confirmDialog);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [docs, htmls] = await Promise.all([
        api.get<{ list: TrashItem[] }>('/docs/trash'),
        api.get<{ list: TrashItem[] }>('/html-previews/trash'),
      ]);
      const merged = [...docs.data.list, ...htmls.data.list].sort(
        (a, b) => new Date(b.deletedAt ?? 0).getTime() - new Date(a.deletedAt ?? 0).getTime(),
      );
      setList(merged);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async (item: TrashItem) => {
    try {
      if (item.kind === 'html') {
        await api.post(`/html-previews/trash/${item.id}/restore`);
      } else {
        await api.post(`/docs/trash/${item.id}/restore`);
      }
      showToast('已恢复', 'success');
      void load();
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const purge = async (item: TrashItem) => {
    const ok = await confirmDialog({
      title: '彻底删除',
      message: `彻底删除《${item.title}》？删除后无法恢复。`,
      confirmText: '彻底删除',
      danger: true,
    });
    if (!ok) return;
    try {
      if (item.kind === 'html') {
        await api.delete(`/html-previews/trash/${item.id}`);
      } else {
        await api.delete(`/docs/trash/${item.id}`);
      }
      showToast('已彻底删除', 'success');
      void load();
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  return (
    <div className="py-6 sm:py-8 animate-fade-in-up">
      <header className="mb-8">
        <h1 className="text-3xl sm:text-[36px] font-serif font-bold text-text-primary mb-2">回收站</h1>
        <p className="text-text-secondary">
          这里是你创建后被删除、或由你删除的公共文档，可以恢复或彻底删除。私人文档删除后不进回收站；HTML 预览删除后都会进回收站。
        </p>
      </header>
      <button
        onClick={() => navigate('/app/docs')}
        className="mb-6 px-3 py-2 rounded-xl border border-black/10 text-sm text-text-secondary hover:bg-black/5"
      >
        返回知识库
      </button>
      {loading ? (
        <div className="text-sm text-text-secondary">加载中…</div>
      ) : list.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center">
          <div className="text-text-secondary text-sm">回收站是空的。</div>
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((item) => (
            <li key={item.id} className="glass-card rounded-xl p-4 flex items-center gap-3">
              {item.kind === 'html' && (
                <span className="shrink-0 rounded-md bg-liquid-indigo/10 px-2 py-0.5 text-xs text-liquid-indigo">HTML</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-text-primary truncate">
                  {item.title || '未命名文档'}
                </div>
                <div className="text-xs text-text-secondary mt-1">
                  删除于 {item.deletedAt ? new Date(item.deletedAt).toLocaleString() : '-'}
                  {item.createdBy ? ` · 作者 ${item.createdBy.name}` : ''}
                  {item.workspace ? ` · ${item.workspace.name}` : ''}
                </div>
              </div>
              <button
                onClick={() => void restore(item)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-black/10 text-text-secondary hover:bg-black/5"
              >
                <RotateCcw size={14} /> 恢复
              </button>
              <button
                onClick={() => void purge(item)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-red-200 text-red-500 hover:bg-red-50"
              >
                <Trash2 size={14} /> 彻底删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
