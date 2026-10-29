import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, Link2, Loader2, RefreshCw, Share2, Trash2 } from 'lucide-react';
import { api, asApiError, uploadFile } from '../../lib/api';
import { useUiStore } from '../../store/ui';
import { Modal } from '../../components/Modal';
import { ShareViewsModal } from '../../components/ShareViewsModal';
import type { ShareLink } from '../../lib/types';

interface PreviewMeta {
  id: string;
  workspaceId: string;
  workspaceKind: string;
  createdById: string;
  title: string;
  entryPath: string;
  fileCount: number;
  totalSize: number;
  canWrite: boolean;
}

interface PreviewFile {
  path: string;
  size: number;
}

function encodeRelPath(rel: string): string {
  return rel.split('/').map(encodeURIComponent).join('/');
}

export function HtmlPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const showToast = useUiStore((s) => s.showToast);
  const [meta, setMeta] = useState<PreviewMeta | null>(null);
  const [files, setFiles] = useState<PreviewFile[]>([]);
  const [entry, setEntry] = useState('');
  const [loading, setLoading] = useState(true);
  const [shareUrl, setShareUrl] = useState('');
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [linkTrack, setLinkTrack] = useState(false);
  const [creating, setCreating] = useState(false);
  const [viewsLink, setViewsLink] = useState<ShareLink | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const reuploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    api
      .get<{ preview: PreviewMeta; files: PreviewFile[] }>(`/html-previews/${id}`)
      .then(({ data }) => {
        setMeta(data.preview);
        setFiles(data.files);
        setEntry(data.preview.entryPath);
      })
      .catch((err) => showToast(asApiError(err).error, 'error'))
      .finally(() => setLoading(false));
  }, [id, showToast]);

  const htmlFiles = files.filter((f) => /\.html?$/i.test(f.path));
  const frameSrc = meta && entry ? `/api/html-previews/${meta.id}/files/${encodeRelPath(entry)}` : '';

  async function refreshShareLinks() {
    if (!id) return;
    try {
      const { data } = await api.get<{ list: ShareLink[] }>('/share', {
        params: { resourceType: 'html', resourceId: id },
      });
      setShareLinks(data.list);
    } catch {
      setShareLinks([]);
    }
  }

  function openShareModal() {
    setShareOpen(true);
    refreshShareLinks();
  }

  async function createShareLink() {
    if (!id || creating) return;
    setCreating(true);
    try {
      const { data } = await api.post<{ link: { token: string } }>('/share', {
        resourceType: 'html',
        resourceId: id,
        role: 'view',
        requireLogin: linkTrack,
        trackViews: linkTrack,
      });
      setShareUrl(`${window.location.origin}/share/${data.link.token}`);
      refreshShareLinks();
    } catch (err) {
      const resp = (err as { response?: { status?: number; data?: { link?: { token: string } } } }).response;
      if (resp?.status === 409 && resp.data?.link?.token) {
        setShareUrl(`${window.location.origin}/share/${resp.data.link.token}`);
        refreshShareLinks();
      } else {
        showToast(asApiError(err).error, 'error');
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleReupload(file: File) {
    if (!id) return;
    try {
      const result = await uploadFile<{ preview: PreviewMeta }>(`/html-previews/${id}/reupload`, file);
      setMeta(result.preview);
      setEntry(result.preview.entryPath);
      const { data: detail } = await api.get<{ files: PreviewFile[] }>(`/html-previews/${id}`);
      setFiles(detail.files);
      showToast('已重新上传', 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  }

  async function handleDelete() {
    if (!id) return;
    try {
      await api.delete(`/html-previews/${id}`);
      showToast('已删除', 'success');
      navigate('/app/docs');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-text-secondary">
        <Loader2 size={16} className="animate-spin" /> 加载中…
      </div>
    );
  }

  if (!meta) {
    return <div className="py-10 text-sm text-text-secondary">该预览不存在或无权查看。</div>;
  }

  return (
    <div className="py-6 sm:py-8 animate-fade-in-up flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => navigate('/app/docs')}
          className="flex items-center gap-1 px-3 py-2 rounded-xl border border-black/10 text-sm text-text-secondary hover:bg-black/5"
        >
          <ArrowLeft size={16} /> 返回列表
        </button>
        <h1 className="text-lg font-semibold text-text-primary truncate flex-1 min-w-40">
          {meta.title}
        </h1>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          入口文件
          <select
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            className="rounded-lg border border-black/10 px-2 py-2 bg-white text-text-primary max-w-60"
          >
            {htmlFiles.map((f) => (
              <option key={f.path} value={f.path}>
                {f.path}
              </option>
            ))}
          </select>
        </label>
        {meta.canWrite && (
          <>
            <button
              onClick={() => reuploadRef.current?.click()}
              className="flex items-center gap-1 px-3 py-2 rounded-xl border border-black/10 text-sm text-text-secondary hover:bg-black/5"
            >
              <RefreshCw size={14} /> 重新上传
            </button>
            <input
              ref={reuploadRef}
              type="file"
              accept=".html,.htm,.zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleReupload(f);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => setDeleteOpen(true)}
              className="flex items-center gap-1 px-3 py-2 rounded-xl border border-black/10 text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} /> 删除
            </button>
          </>
        )}
        <button
          onClick={openShareModal}
          className="flex items-center gap-1 px-3 py-2 rounded-xl bg-liquid-indigo text-white text-sm hover:bg-primary"
        >
          <Share2 size={14} /> 分享
        </button>
      </div>

      {frameSrc && (
        <iframe
          key={frameSrc}
          title={meta.title}
          src={frameSrc}
          sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
          allow="clipboard-write; fullscreen"
          style={{ width: '100%', height: 'calc(100dvh - 190px)', minHeight: 480, border: 0 }}
          className="rounded-xl border border-black/10 bg-white"
        />
      )}

      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="分享 HTML 预览">
        <p className="text-sm text-text-secondary mb-3">
          对方打开这个链接就是裸预览，不用登录、没有平台按钮；链接可随时撤销。
        </p>
        <label className="flex items-center gap-2 mb-2 text-xs text-text-secondary cursor-pointer select-none">
          <input
            type="checkbox"
            checked={linkTrack}
            onChange={(e) => setLinkTrack(e.target.checked)}
            className="accent-liquid-indigo"
          />
          记录观看情况（开启后需登录才能打开，并记录每位观看者的打开次数与可见时长）
        </label>
        <div className={`text-[11px] mb-2 ${shareLinks.some((l) => l.role === 'view' && l.trackViews === linkTrack) ? 'text-danger' : 'text-text-secondary'}`}>
          {shareLinks.some((l) => l.role === 'view' && l.trackViews === linkTrack)
            ? '该组合的链接已存在（见下方列表），如需更换请先撤销旧链接。'
            : `将创建：仅查看${linkTrack ? ' · 记录观看' : ''}链接（每份资源最多 4 条：查看/编辑 × 记录/不记录）`}
        </div>
        <button
          onClick={() => void createShareLink()}
          disabled={creating}
          className="flex items-center gap-1 px-3 h-8 rounded-md bg-liquid-indigo text-white text-xs hover:bg-primary disabled:opacity-50 disabled:cursor-not-allowed mb-3"
        >
          <Link2 size={12} /> 生成链接
        </button>
        <div className="flex items-center gap-2">
          <input
            value={shareUrl}
            readOnly
            onFocus={(e) => e.target.select()}
            className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm"
          />
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareUrl);
                showToast('链接已复制', 'success');
              } catch {
                showToast('复制失败，请手动复制', 'error');
              }
            }}
            className="px-3 py-2 rounded-lg bg-liquid-indigo text-white text-sm hover:bg-primary"
          >
            复制链接
          </button>
        </div>
        {shareLinks.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {shareLinks.map((l) => (
              <div key={l.id} className="flex items-center gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <span className="block truncate text-text-secondary">
                    {window.location.origin}/share/{l.token}
                  </span>
                  {l.trackViews && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-liquid-indigo/10 text-liquid-indigo">
                      <Eye size={10} /> 记录观看
                    </span>
                  )}
                </div>
                {l.trackViews && (
                  <button
                    onClick={() => setViewsLink(l)}
                    className="p-1.5 text-text-secondary hover:text-liquid-indigo"
                    title="观看记录"
                  >
                    <Eye size={14} />
                  </button>
                )}
                <button
                  onClick={async () => {
                    try {
                      await api.delete(`/share/${l.id}`);
                      showToast('链接已撤销', 'success');
                      if (shareUrl.endsWith(`/share/${l.token}`)) setShareUrl('');
                      refreshShareLinks();
                    } catch (err) {
                      showToast(asApiError(err).error, 'error');
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg border border-black/10 text-xs text-red-600 hover:bg-red-50"
                >
                  撤销
                </button>
              </div>
            ))}
          </div>
        )}
        {viewsLink && <ShareViewsModal link={viewsLink} onClose={() => setViewsLink(null)} />}
      </Modal>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="删除 HTML 预览">
        <p className="text-sm text-text-secondary mb-4">
          删除后文件和分享链接一并失效，无法恢复。确定删除吗？
        </p>
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={() => setDeleteOpen(false)}
            className="px-4 py-2 rounded-lg border border-black/10 text-sm text-text-secondary hover:bg-black/5"
          >
            取消
          </button>
          <button
            onClick={handleDelete}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700"
          >
            确认删除
          </button>
        </div>
      </Modal>
    </div>
  );
}
