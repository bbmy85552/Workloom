import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Upload } from 'lucide-react';
import { api, asApiError, uploadFile } from '../../lib/api';
import { useUiStore } from '../../store/ui';

interface WorkspaceOption {
  id: string;
  name: string;
  kind: string;
}

export function HtmlUploadPage() {
  const navigate = useNavigate();
  const showToast = useUiStore((s) => s.showToast);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState('');
  const [entryPath, setEntryPath] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api
      .get<{ list: WorkspaceOption[] }>('/workspaces')
      .then(({ data }) => {
        setWorkspaces(data.list);
        const firstPrivate = data.list.find((w) => w.kind === 'PRIVATE');
        setTarget(firstPrivate ? firstPrivate.id : data.list[0]?.id ?? '');
      })
      .catch((err) => showToast(asApiError(err).error, 'error'));
  }, [showToast]);

  const hasPublicOwned = workspaces.some((w) => w.kind === 'PUBLIC');

  async function handleSubmit() {
    if (!file) {
      showToast('请先选择文件', 'error');
      return;
    }
    if (!target) {
      showToast('请先选择目标位置', 'error');
      return;
    }
    setUploading(true);
    try {
      const extra: Record<string, string> = {};
      if (target === '__public__') extra.workspaceKind = 'PUBLIC';
      else extra.workspaceId = target;
      if (title.trim()) extra.title = title.trim();
      if (entryPath.trim()) extra.entryPath = entryPath.trim();
      const data = await uploadFile<{ preview: { id: string } }>('/html-previews', file, extra);
      showToast('上传成功', 'success');
      navigate(`/app/html/${data.preview.id}`);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="py-6 sm:py-8 animate-fade-in-up max-w-2xl">
      <h1 className="text-3xl sm:text-[36px] font-serif font-bold text-text-primary mb-2">
        上传 HTML 预览
      </h1>
      <p className="text-text-secondary mb-6">
        支持单个 .html / .htm 文件，或打包好的 .zip；zip 内的目录结构和相对引用会原样保留。
      </p>

      <div className="rounded-xl border border-black/10 bg-white px-4 py-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-secondary">目标位置</span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="rounded-lg border border-black/10 px-3 py-2 bg-white"
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.kind === 'PUBLIC' ? '（公共知识库）' : '（私人空间）'}
              </option>
            ))}
            {!hasPublicOwned && <option value="__public__">公共知识库</option>}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-secondary">标题（不填则用文件名）</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：活动页 demo"
            className="rounded-lg border border-black/10 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-secondary">入口文件（不填则默认取 index.html）</span>
          <input
            value={entryPath}
            onChange={(e) => setEntryPath(e.target.value)}
            placeholder="例如：pages/home.html"
            className="rounded-lg border border-black/10 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-secondary">文件（单个预览最大 100MB）</span>
          <input
            type="file"
            accept=".html,.htm,.zip"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="rounded-lg border border-black/10 px-3 py-2 bg-white"
          />
          {file && <span className="text-xs text-text-secondary">已选择：{file.name}</span>}
        </label>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSubmit}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-liquid-indigo text-white text-sm font-medium hover:bg-primary transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {uploading ? '上传中…' : '上传并预览'}
          </button>
          <button
            onClick={() => navigate('/app/html')}
            className="px-4 py-2.5 rounded-xl border border-black/10 text-sm text-text-secondary hover:bg-black/5"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
