import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Globe, Plus, Loader2 } from 'lucide-react';
import { api, asApiError } from '../../lib/api';
import { useUiStore } from '../../store/ui';

export interface HtmlPreviewItem {
  id: string;
  workspaceId: string;
  workspaceKind: string;
  createdById: string;
  createdByName: string;
  title: string;
  entryPath: string;
  fileCount: number;
  totalSize: number;
  createdAt: string;
  updatedAt: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function HtmlListPage() {
  const navigate = useNavigate();
  const showToast = useUiStore((s) => s.showToast);
  const [items, setItems] = useState<HtmlPreviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ previews: HtmlPreviewItem[] }>('/html-previews')
      .then(({ data }) => setItems(data.previews))
      .catch((err) => showToast(asApiError(err).error, 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  return (
    <div className="py-6 sm:py-8 animate-fade-in-up">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl sm:text-[36px] font-serif font-bold text-text-primary mb-2">
            HTML 预览
          </h1>
          <p className="text-text-secondary">上传 HTML demo 或打包好的文件夹，原样查看效果。</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => navigate('/app/docs')}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-black/10 text-sm text-text-secondary hover:bg-black/5"
          >
            返回知识库
          </button>
          <button
            onClick={() => navigate('/app/html/new')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-liquid-indigo text-white text-sm font-medium hover:bg-primary transition-colors shadow-md shadow-liquid-indigo/20"
          >
            <Plus size={16} /> 上传 HTML 预览
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 size={16} className="animate-spin" /> 加载中…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/15 px-6 py-12 text-center text-sm text-text-secondary">
          还没有 HTML 预览，点右上角上传第一个 demo 吧。
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Link
              key={item.id}
              to={`/app/html/${item.id}`}
              className="rounded-xl border border-black/10 bg-white px-4 py-3 hover:border-liquid-indigo/50 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <Globe size={16} className="text-liquid-indigo shrink-0" />
                <span className="font-medium text-text-primary truncate">{item.title}</span>
              </div>
              <div className="text-xs text-text-secondary leading-5">
                <span>{item.workspaceKind === 'PUBLIC' ? '公共知识库' : '私人空间'}</span>
                <span className="mx-1">·</span>
                <span>{item.fileCount} 个文件</span>
                <span className="mx-1">·</span>
                <span>{formatSize(item.totalSize)}</span>
              </div>
              <div className="text-xs text-text-secondary mt-1 truncate">
                入口：{item.entryPath}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
