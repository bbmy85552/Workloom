import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ClipboardCopy,
  Globe,
  Lock,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Share2,
  Trash2,
  Bot,
} from 'lucide-react';
import { api, asApiError } from '../../lib/api';
import { useUiStore } from '../../store/ui';
import { Modal } from '../../components/Modal';
import { ShareDialog } from '../../components/ShareDialog';
import {
  MEMORY_KIND_OPTIONS,
  MEMORY_MCP_URL,
  ROLE_LABEL,
  kindMeta,
  type MemoryAccess,
  type MemoryItem,
  type MemoryKind,
  type MemoryProject,
} from './types';

interface ItemForm {
  id?: string;
  kind: MemoryKind;
  title: string;
  content: string;
  tags: string;
  pinned: boolean;
}

const EMPTY_FORM: ItemForm = { kind: 'fact', title: '', content: '', tags: '', pinned: true };

const inputCls =
  'w-full px-3 py-2 rounded-xl border border-black/10 bg-white text-sm outline-none focus:border-liquid-indigo focus:ring-2 focus:ring-liquid-indigo/15';

export function MemoryDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const showToast = useUiStore((s) => s.showToast);
  const confirmDialog = useUiStore((s) => s.confirmDialog);
  const alertDialog = useUiStore((s) => s.alertDialog);

  const [project, setProject] = useState<MemoryProject | null>(null);
  const [access, setAccess] = useState<MemoryAccess | null>(null);
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [kind, setKind] = useState<MemoryKind | 'all'>('all');
  const [q, setQ] = useState('');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [editor, setEditor] = useState<ItemForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [projectEdit, setProjectEdit] = useState<{ name: string; description: string } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const loadProject = useCallback(async () => {
    try {
      const { data } = await api.get<{ project: MemoryProject; access: MemoryAccess }>(`/memory/projects/${id}`);
      setProject(data.project);
      setAccess(data.access);
      setError('');
    } catch (err) {
      setError(asApiError(err).error);
    }
  }, [id]);

  const loadItems = useCallback(async () => {
    try {
      const { data } = await api.get<{ items: MemoryItem[] }>(`/memory/projects/${id}/items`);
      setItems(data.items);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  }, [id, showToast]);

  useEffect(() => {
    setLoading(true);
    void Promise.all([loadProject(), loadItems()]).finally(() => setLoading(false));
  }, [loadItems, loadProject]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      if (kind !== 'all' && it.kind !== kind) return false;
      if (pinnedOnly && !it.pinned) return false;
      if (!needle) return true;
      return (
        it.content.toLowerCase().includes(needle) ||
        (it.title ?? '').toLowerCase().includes(needle) ||
        it.tags.some((t) => t.toLowerCase().includes(needle))
      );
    });
  }, [items, kind, pinnedOnly, q]);

  const kindCounts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const it of items) c[it.kind] = (c[it.kind] ?? 0) + 1;
    return c;
  }, [items]);

  const canWrite = !!access?.canWrite;

  const saveItem = async () => {
    if (!editor) return;
    const content = editor.content.trim();
    if (!content) {
      showToast('请填写记忆内容', 'error');
      return;
    }
    const body = {
      kind: editor.kind,
      title: editor.title.trim() || null,
      content,
      pinned: editor.pinned,
      tags: editor.tags
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean),
    };
    setSaving(true);
    try {
      if (editor.id) {
        const { data } = await api.patch<{ item: MemoryItem }>(`/memory/projects/${id}/items/${editor.id}`, body);
        setItems((arr) => arr.map((x) => (x.id === data.item.id ? data.item : x)));
        showToast('已保存', 'success');
      } else {
        const { data } = await api.post<{ item: MemoryItem }>(`/memory/projects/${id}/items`, body);
        setItems((arr) => [data.item, ...arr]);
        showToast('已添加记忆', 'success');
      }
      setEditor(null);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      setSaving(false);
    }
  };

  const togglePin = async (it: MemoryItem) => {
    try {
      const { data } = await api.patch<{ item: MemoryItem }>(`/memory/projects/${id}/items/${it.id}`, {
        pinned: !it.pinned,
      });
      setItems((arr) => arr.map((x) => (x.id === it.id ? data.item : x)));
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const removeItem = async (it: MemoryItem) => {
    const ok = await confirmDialog({
      title: '删除记忆',
      message: '确认删除这条记忆？AI 将不再读取到它。',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/memory/projects/${id}/items/${it.id}`);
      setItems((arr) => arr.filter((x) => x.id !== it.id));
      showToast('已删除', 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const copyAll = async () => {
    try {
      const { data } = await api.get<{ markdown: string; count: number }>(`/memory/projects/${id}/markdown`);
      try {
        await navigator.clipboard.writeText(data.markdown);
        showToast(`已复制 ${data.count} 条置顶记忆（Markdown）`, 'success');
      } catch {
        await alertDialog({ title: '请手动复制', message: data.markdown, mono: true });
      }
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const saveProject = async () => {
    if (!projectEdit) return;
    const name = projectEdit.name.trim();
    if (!name) return showToast('请输入项目名称', 'error');
    try {
      const { data } = await api.patch<{ project: MemoryProject }>(`/memory/projects/${id}`, {
        name,
        description: projectEdit.description.trim() || null,
      });
      setProject((p) => (p ? { ...p, ...data.project } : data.project));
      setProjectEdit(null);
      showToast('已保存', 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const removeProject = async () => {
    if (!project) return;
    const ok = await confirmDialog({
      title: '删除项目',
      message: `确认删除项目「${project.name}」及其全部记忆？`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/memory/projects/${id}`);
      showToast('项目已删除', 'success');
      navigate('/app/memory');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  if (loading && !project) {
    return <div className="py-8 text-sm text-text-secondary">加载中…</div>;
  }
  if (error || !project) {
    return (
      <div className="py-8">
        <Link to="/app/memory" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-4">
          <ArrowLeft size={14} /> 返回项目记忆
        </Link>
        <div className="glass-card rounded-2xl p-10 text-center text-sm text-text-secondary">{error || '项目不存在'}</div>
      </div>
    );
  }

  const isPublic = project.workspace.kind === 'PUBLIC';
  const mcpSnippet = `项目：${project.name}\nprojectId：${project.id}\nMCP 地址：${MEMORY_MCP_URL}\n\n提示词示例：开始前请调用 memory_get（projectId=${project.id}）读取项目记忆；有新的决策/事实时用 memory_add 记录。`;

  return (
    <div className="py-6 sm:py-8 animate-fade-in-up">
      <Link
        to={`/app/memory${isPublic ? '?tab=public' : ''}`}
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-4"
      >
        <ArrowLeft size={14} /> 返回项目记忆
      </Link>

      <header className="mb-6 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-text-primary break-all">{project.name}</h1>
            <span
              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md ${
                isPublic ? 'bg-emerald-50 text-emerald-700' : 'bg-black/5 text-text-secondary'
              }`}
            >
              {isPublic ? <Globe size={12} /> : <Lock size={12} />} {isPublic ? '公共' : '私人'}
            </span>
            {access && <span className="text-xs text-text-secondary">{ROLE_LABEL[access.role]}</span>}
          </div>
          {project.description && (
            <p className="text-sm text-text-secondary mt-2 whitespace-pre-wrap">{project.description}</p>
          )}
          <div className="text-xs text-text-secondary mt-2">
            {project.createdBy ? `创建者 ${project.createdBy.name} · ` : ''}更新于 {new Date(project.updatedAt).toLocaleString()}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            onClick={copyAll}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-black/10 text-sm text-text-secondary hover:bg-black/5"
            title="复制全部置顶记忆为 Markdown，可粘贴到不支持 MCP 的 AI 平台"
          >
            <ClipboardCopy size={14} /> 复制全部记忆
          </button>
          <button
            onClick={() => setAiOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-black/10 text-sm text-text-secondary hover:bg-black/5"
          >
            <Bot size={14} /> AI 接入
          </button>
          <button
            onClick={() => setShareOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-black/10 text-sm text-text-secondary hover:bg-black/5"
          >
            <Share2 size={14} /> 协作者
          </button>
          {canWrite && (
            <button
              onClick={() => setProjectEdit({ name: project.name, description: project.description ?? '' })}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-black/10 text-sm text-text-secondary hover:bg-black/5"
            >
              <Pencil size={14} /> 编辑
            </button>
          )}
          {access?.canDelete && (
            <button
              onClick={removeProject}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} /> 删除
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div className="flex items-center gap-1 bg-black/5 rounded-xl p-1 w-fit text-sm flex-wrap">
          {([{ v: 'all', label: '全部' }, ...MEMORY_KIND_OPTIONS] as { v: MemoryKind | 'all'; label: string }[]).map((k) => (
            <button
              key={k.v}
              onClick={() => setKind(k.v)}
              className={`px-3 py-1.5 rounded-lg inline-flex items-center gap-1 transition-colors ${
                kind === k.v ? 'bg-white shadow-sm text-text-primary' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {k.label}
              <span className="text-xs text-text-secondary">{kindCounts[k.v] ?? 0}</span>
            </button>
          ))}
        </div>
        {canWrite && (
          <button
            onClick={() => setEditor({ ...EMPTY_FORM, kind: kind === 'all' ? 'fact' : kind })}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-liquid-indigo text-white text-sm font-medium hover:bg-primary transition-colors w-fit"
          >
            <Plus size={14} /> 添加记忆
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <div className="relative max-w-md flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索内容、标题或标签…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-black/10 bg-white/80 text-sm outline-none focus:border-liquid-indigo focus:ring-2 focus:ring-liquid-indigo/15"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-text-secondary select-none">
          <input type="checkbox" checked={pinnedOnly} onChange={(e) => setPinnedOnly(e.target.checked)} />
          仅看置顶（AI 默认读取）
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center text-sm text-text-secondary">
          {items.length === 0
            ? canWrite
              ? '还没有记忆。点击「添加记忆」，或让 AI 通过 MCP 的 memory_add 写入。'
              : '这个项目还没有记忆。'
            : '没有符合筛选条件的记忆。'}
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((it) => {
            const meta = kindMeta(it.kind);
            return (
              <li key={it.id} className="glass-card rounded-xl p-4 group">
                <div className="flex items-start gap-3">
                  <span className={`text-[11px] px-2 py-0.5 rounded-md border shrink-0 mt-0.5 ${meta.cls}`}>{meta.label}</span>
                  <div className="min-w-0 flex-1">
                    {it.title && <div className="text-sm font-semibold text-text-primary mb-1">{it.title}</div>}
                    <div className="text-sm text-text-primary whitespace-pre-wrap break-words">{it.content}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
                      {it.tags.map((t) => (
                        <span key={t} className="px-1.5 py-0.5 rounded bg-black/5">
                          #{t}
                        </span>
                      ))}
                      <span>
                        {(it.updatedBy ?? it.createdBy)?.name ?? ''} · {new Date(it.updatedAt).toLocaleString()}
                        {it.source ? ` · 来源 ${it.source}` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      disabled={!canWrite}
                      onClick={() => togglePin(it)}
                      title={it.pinned ? '已置顶（AI 默认读取），点击取消' : '未置顶，点击置顶'}
                      className={`p-1.5 rounded-md ${
                        it.pinned ? 'text-liquid-indigo' : 'text-text-secondary/60'
                      } ${canWrite ? 'hover:bg-black/5' : 'cursor-default'}`}
                    >
                      {it.pinned ? <Pin size={14} /> : <PinOff size={14} />}
                    </button>
                    {canWrite && (
                      <>
                        <button
                          onClick={() =>
                            setEditor({
                              id: it.id,
                              kind: it.kind,
                              title: it.title ?? '',
                              content: it.content,
                              tags: it.tags.join(', '),
                              pinned: it.pinned,
                            })
                          }
                          className="p-1.5 text-text-secondary hover:text-liquid-indigo hover:bg-liquid-indigo/5 rounded-md"
                          title="编辑"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => removeItem(it)}
                          className="p-1.5 text-text-secondary hover:text-red-500 hover:bg-red-50 rounded-md"
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={!!editor} onClose={() => setEditor(null)} title={editor?.id ? '编辑记忆' : '添加记忆'}>
        {editor && (
          <div className="space-y-4">
            <div>
              <div className="text-xs font-medium text-text-secondary mb-1.5">类型</div>
              <div className="flex flex-wrap gap-1.5">
                {MEMORY_KIND_OPTIONS.map((k) => (
                  <button
                    key={k.v}
                    type="button"
                    onClick={() => setEditor((f) => (f ? { ...f, kind: k.v } : f))}
                    className={`px-3 py-1.5 rounded-lg border text-sm ${
                      editor.kind === k.v ? k.cls + ' ring-2 ring-liquid-indigo/20' : 'border-black/10 text-text-secondary'
                    }`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <div className="text-xs font-medium text-text-secondary mb-1.5">标题（可选）</div>
              <input
                value={editor.title}
                maxLength={200}
                onChange={(e) => setEditor((f) => (f ? { ...f, title: e.target.value } : f))}
                className={inputCls}
              />
            </label>
            <label className="block">
              <div className="text-xs font-medium text-text-secondary mb-1.5">内容</div>
              <textarea
                autoFocus
                value={editor.content}
                rows={6}
                maxLength={20000}
                onChange={(e) => setEditor((f) => (f ? { ...f, content: e.target.value } : f))}
                placeholder="一条记忆只写一件事，例如：数据库使用 SQLite，不引入 Postgres。"
                className={inputCls}
              />
            </label>
            <label className="block">
              <div className="text-xs font-medium text-text-secondary mb-1.5">标签（逗号分隔，可选）</div>
              <input
                value={editor.tags}
                onChange={(e) => setEditor((f) => (f ? { ...f, tags: e.target.value } : f))}
                placeholder="例如：后端, 部署"
                className={inputCls}
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-text-secondary select-none">
              <input
                type="checkbox"
                checked={editor.pinned}
                onChange={(e) => setEditor((f) => (f ? { ...f, pinned: e.target.checked } : f))}
              />
              置顶（AI 调用 memory_get 时默认读取）
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditor(null)}
                className="px-4 py-2 rounded-xl border border-black/10 text-sm text-text-secondary hover:bg-black/5"
              >
                取消
              </button>
              <button
                disabled={saving}
                onClick={saveItem}
                className="px-4 py-2 rounded-xl bg-liquid-indigo text-white text-sm font-medium hover:bg-primary disabled:opacity-60"
              >
                保存
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!projectEdit} onClose={() => setProjectEdit(null)} title="编辑项目">
        {projectEdit && (
          <div className="space-y-4">
            <label className="block">
              <div className="text-xs font-medium text-text-secondary mb-1.5">项目名称</div>
              <input
                value={projectEdit.name}
                maxLength={80}
                onChange={(e) => setProjectEdit((p) => (p ? { ...p, name: e.target.value } : p))}
                className={inputCls}
              />
            </label>
            <label className="block">
              <div className="text-xs font-medium text-text-secondary mb-1.5">简介</div>
              <textarea
                value={projectEdit.description}
                rows={4}
                maxLength={2000}
                onChange={(e) => setProjectEdit((p) => (p ? { ...p, description: e.target.value } : p))}
                className={inputCls}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setProjectEdit(null)}
                className="px-4 py-2 rounded-xl border border-black/10 text-sm text-text-secondary hover:bg-black/5"
              >
                取消
              </button>
              <button
                onClick={saveProject}
                className="px-4 py-2 rounded-xl bg-liquid-indigo text-white text-sm font-medium hover:bg-primary"
              >
                保存
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={aiOpen} onClose={() => setAiOpen(false)} title="让 AI 读写这个项目的记忆">
        <div className="space-y-3 text-sm text-text-secondary">
          <p>
            在支持 MCP 的客户端（Claude Desktop、Cursor、Claude Code 等）中添加远程 MCP，地址使用
            <code className="mx-1 px-1 rounded bg-black/5 text-text-primary">{MEMORY_MCP_URL}</code>，
            认证使用你的 API Key（在
            <Link to="/app/settings/cli" className="text-liquid-indigo mx-1 hover:underline">
              设置 → AI 与 CLI
            </Link>
            生成，含完整配置示例）。
          </p>
          <pre className="overflow-x-auto rounded-xl border border-black/10 bg-surface-container-lowest px-4 py-3 text-xs leading-relaxed text-text-primary whitespace-pre-wrap">
            {mcpSnippet}
          </pre>
          <p>不支持 MCP 的平台（如 ChatGPT 网页版）：点击「复制全部记忆」，把 Markdown 粘贴到对话或项目说明里。</p>
          <div className="flex justify-end">
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(mcpSnippet);
                  showToast('已复制', 'success');
                } catch {
                  await alertDialog({ title: '请手动复制', message: mcpSnippet, mono: true });
                }
              }}
              className="px-4 py-2 rounded-xl border border-black/10 text-sm hover:bg-black/5"
            >
              复制以上信息
            </button>
          </div>
        </div>
      </Modal>

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        resourceType="memory"
        resourceId={project.id}
        canManage={!!access?.canInvite}
      />
    </div>
  );
}
