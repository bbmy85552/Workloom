import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FileText,
  Copy,
  Folder,
  FolderPlus,
  Plus,
  Search,
  Trash2,
  Pencil,
  Upload,
  Globe,
  Lock,
  Users,
  Star,
  LayoutGrid,
  ListTree,
  Loader2,
  FolderInput,
  FolderOutput,
} from 'lucide-react';
import { api, asApiError, uploadFile } from '../../lib/api';
import { useUiStore } from '../../store/ui';
import { useAuthStore } from '../../store/auth';
import type { DocNode, DocTreeResponse } from '../../lib/types';
import { Modal } from '../../components/Modal';
import { DocTree, buildTree } from '../../components/docs/DocTree';

type Tab = 'mine' | 'public' | 'shared' | 'favorites';
type ViewLayout = 'grid' | 'tree';

const FOLDER_PALETTES = [
  {
    tile: 'bg-blue-100 text-blue-700 border-blue-200',
    card: 'hover:border-blue-200',
    glow: 'ring-blue-300 shadow-blue-100',
  },
  {
    tile: 'bg-sky-100 text-sky-700 border-sky-200',
    card: 'hover:border-sky-200',
    glow: 'ring-sky-300 shadow-sky-100',
  },
  {
    tile: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    card: 'hover:border-emerald-200',
    glow: 'ring-emerald-300 shadow-emerald-100',
  },
  {
    tile: 'bg-amber-100 text-amber-700 border-amber-200',
    card: 'hover:border-amber-200',
    glow: 'ring-amber-300 shadow-amber-100',
  },
  {
    tile: 'bg-rose-100 text-rose-700 border-rose-200',
    card: 'hover:border-rose-200',
    glow: 'ring-rose-300 shadow-rose-100',
  },
  {
    tile: 'bg-violet-100 text-violet-700 border-violet-200',
    card: 'hover:border-violet-200',
    glow: 'ring-violet-300 shadow-violet-100',
  },
];

function folderPalette(id: string) {
  const sum = Array.from(id).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return FOLDER_PALETTES[sum % FOLDER_PALETTES.length];
}

export function DocsListPage() {
  const [tree, setTree] = useState<DocTreeResponse | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState('');
  // 从 URL 读取初始 tab 和 folderId，使进入文件夹的状态可分享/刷新保留
  const initialTab = (searchParams.get('tab') as Tab) || 'mine';
  const [tab, setTab] = useState<Tab>(['mine', 'public', 'shared', 'favorites'].includes(initialTab) ? initialTab : 'mine');
  const [layout, setLayout] = useState<ViewLayout>(
    () => (localStorage.getItem('docs.layout') as ViewLayout) || 'grid',
  );
  const [createOpen, setCreateOpen] = useState<{
    mode: 'create' | 'import' | 'folder';
    files?: File[];
    parentId?: string | null;
  } | null>(null);
  const [moveTarget, setMoveTarget] = useState<DocNode | null>(null);
  const [moveFolderId, setMoveFolderId] = useState<string | null>(null);
  const [publicFolderId, setPublicFolderId] = useState<string | null>(() => searchParams.get('folder'));
  const [mineFolderId, setMineFolderId] = useState<string | null>(() => searchParams.get('folder'));
  const [draggingDocId, setDraggingDocId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [createKind, setCreateKind] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE');
  const [createTitle, setCreateTitle] = useState('未命名文档');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [importIndex, setImportIndex] = useState(0);
  const [importFailures, setImportFailures] = useState<string[]>([]);
  const navigate = useNavigate();
  const showToast = useUiStore((s) => s.showToast);
  const confirmDialog = useUiStore((s) => s.confirmDialog);
  const promptDialog = useUiStore((s) => s.promptDialog);
  const user = useAuthStore((s) => s.user);
  const importInputRef = useRef<HTMLInputElement>(null);
  const createSubmittingRef = useRef(false);

  const syncFolderUrl = useCallback(
    (nextTab: Tab, folderId: string | null) => {
      const params: Record<string, string> = {};
      if (nextTab !== 'mine') params.tab = nextTab;
      if (folderId) params.folder = folderId;
      setSearchParams(params, { replace: true });
    },
    [setSearchParams],
  );

  const focusFolderLocation = useCallback(
    (nextTab: Tab, folderId: string | null) => {
      setTab(nextTab);
      setLayout('grid');
      setQ('');
      if (nextTab === 'public') {
        setPublicFolderId(folderId);
        setMineFolderId(null);
      } else if (nextTab === 'mine') {
        setMineFolderId(folderId);
        setPublicFolderId(null);
      } else {
        setMineFolderId(null);
        setPublicFolderId(null);
      }
      syncFolderUrl(nextTab, folderId);
    },
    [syncFolderUrl],
  );

  useEffect(() => {
    localStorage.setItem('docs.layout', layout);
  }, [layout]);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<DocTreeResponse>('/docs/tree', {
        params: { _ts: Date.now() },
      });
      setTree(data);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitCreate = async () => {
    if (!createOpen || createSubmittingRef.current) return;
    createSubmittingRef.current = true;
    setCreateSubmitting(true);
    setImportIndex(0);
    setImportFailures([]);
    try {
      if (createOpen.mode === 'import') {
        const files = createOpen.files ?? [];
        if (files.length === 0) return;
        const imported: DocNode[] = [];
        const failed: string[] = [];

        for (const [index, file] of files.entries()) {
          setImportIndex(index);
          try {
            const data = await uploadFile<{ doc: DocNode }>('/docs/import', file, {
              workspaceKind: createKind,
            });
            imported.push(data.doc);
          } catch (err) {
            failed.push(`${file.name}：${asApiError(err).error}`);
          }
        }

        setImportFailures(failed);
        if (imported.length > 0) {
          await load();
        }
        if (failed.length > 0) {
          showToast(`已导入 ${imported.length} 个，失败 ${failed.length} 个`, 'error');
          return;
        }
        showToast(
          imported.length === 1 ? `已导入：${imported[0].title}` : `已导入 ${imported.length} 个文档`,
          'success',
        );
        setCreateOpen(null);
        if (imported.length === 1) {
          navigate(`/app/docs/${imported[0].id}`);
        }
      } else {
        const { data } = await api.post<{ doc: DocNode }>('/docs', {
          workspaceKind: createKind,
          title: createTitle.trim() || '未命名文档',
          parentId: createOpen.parentId ?? null,
          isFolder: createOpen.mode === 'folder',
        });
        setCreateOpen(null);
        if (createOpen.mode === 'folder') {
          await load();
          const parentLevel = createOpen.parentId ?? null;
          if (createKind === 'PRIVATE') {
            setTab('mine');
            setMineFolderId(parentLevel);
          } else {
            setTab('public');
            setPublicFolderId(parentLevel);
          }
          showToast('文件夹已创建', 'success');
        } else {
          navigate(`/app/docs/${data.doc.id}`);
        }
      }
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      createSubmittingRef.current = false;
      setCreateSubmitting(false);
    }
  };

  const moveDoc = async (doc: DocNode, newParentId: string | null) => {
    try {
      await api.patch(`/docs/${doc.id}`, { parentId: newParentId });
      await load();
      if (doc.isFolder) {
        focusFolderLocation(tab, newParentId);
      }
      showToast(doc.isFolder ? '已移动文件夹' : '已移动文档', 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const openMoveDialog = (doc: DocNode) => {
    setMoveTarget(doc);
    setMoveFolderId(doc.parentId ?? null);
  };

  const submitMoveToFolder = async () => {
    if (!moveTarget) return;
    try {
      await api.patch(`/docs/${moveTarget.id}`, { parentId: moveFolderId });
      setMoveTarget(null);
      await load();
      if (moveTarget.isFolder) {
        focusFolderLocation(tab, moveFolderId);
      }
      showToast(moveTarget.isFolder ? '文件夹已移动' : '已移动到文件夹', 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const rename = async (doc: DocNode) => {
    const t = await promptDialog({
      title: '重命名文档',
      message: '请输入新的文档标题：',
      defaultValue: doc.title,
      confirmText: '保存',
    });
    if (t === null) return;
    const title = t.trim();
    if (!title || title === doc.title) return;
    try {
      await api.patch(`/docs/${doc.id}`, { title });
      await load();
      showToast('已重命名', 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const remove = async (doc: DocNode) => {
    const ok = await confirmDialog({
      title: '删除文档',
      message: `确认删除文档「${doc.title}」？此操作不可恢复。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/docs/${doc.id}`);
      await load();
      showToast('已删除', 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const copyToPublic = async (doc: DocNode) => {
    const ok = await confirmDialog({
      title: '复制到公共知识库',
      message: `确认将「${doc.title}」复制到公共知识库？复制后所有注册用户都可以查看。`,
      confirmText: '复制',
    });
    if (!ok) return;
    try {
      const { data } = await api.post<{ doc: DocNode; copiedCount: number }>(`/docs/${doc.id}/copy-to-public`);
      await load();
      showToast(data.copiedCount > 1 ? `已复制 ${data.copiedCount} 个文档到公共知识库` : '已复制到公共知识库', 'success');
      setTab('public');
      navigate(`/app/docs/${data.doc.id}`);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const moveToPublic = async (doc: DocNode) => {
    const ok = await confirmDialog({
      title: '移动到公共知识库',
      message: `确认将「${doc.title}」移动到公共知识库？移动后将从私人知识库移除，所有注册用户可查看。`,
      confirmText: '移动',
    });
    if (!ok) return;
    try {
      const { data } = await api.post<{ doc: DocNode; movedCount: number }>(`/docs/${doc.id}/move-to-public`);
      await load();
      showToast(data.movedCount > 1 ? `已移动 ${data.movedCount} 个文档到公共知识库` : '已移动到公共知识库', 'success');
      if (doc.isFolder) {
        focusFolderLocation('public', data.doc.id);
      } else {
        setTab('public');
        navigate(`/app/docs/${data.doc.id}`);
      }
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const moveToPrivate = async (doc: DocNode) => {
    const ok = await confirmDialog({
      title: '移到我的私密空间',
      message: `确认将「${doc.title}」移到你的私密空间？移动后将从公共知识库移除，仅你的管理员账号可访问。`,
      confirmText: '转为私密',
    });
    if (!ok) return;
    try {
      const { data } = await api.post<{ doc: DocNode; movedCount: number }>(`/docs/${doc.id}/move-to-private`);
      await load();
      showToast(data.movedCount > 1 ? `已将 ${data.movedCount} 个文档移到私密空间` : '已移到我的私密空间', 'success');
      if (doc.isFolder) {
        focusFolderLocation('mine', data.doc.id);
      } else {
        setTab('mine');
        navigate(`/app/docs/${data.doc.id}`);
      }
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const allPublicDocs = tree?.public ?? [];
  const publicFolders = useMemo(
    () => allPublicDocs.filter((d) => d.isFolder).sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN')),
    [allPublicDocs],
  );
  const publicFolderPath = useMemo(() => {
    if (!publicFolderId) return [];
    const map = new Map(allPublicDocs.map((d) => [d.id, d]));
    const path: DocNode[] = [];
    const seen = new Set<string>();
    let cursor = map.get(publicFolderId);
    while (cursor && !seen.has(cursor.id)) {
      path.unshift(cursor);
      seen.add(cursor.id);
      cursor = cursor.parentId ? map.get(cursor.parentId) : undefined;
    }
    return path;
  }, [allPublicDocs, publicFolderId]);

  useEffect(() => {
    if (!tree || tab !== 'public' || !publicFolderId) return;
    if (!allPublicDocs.some((doc) => doc.id === publicFolderId && doc.isFolder)) {
      focusFolderLocation('public', null);
    }
  }, [allPublicDocs, focusFolderLocation, publicFolderId, tab, tree]);

  const allMineDocs = tree?.mine ?? [];
  const mineFolders = useMemo(
    () => allMineDocs.filter((d) => d.isFolder).sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN')),
    [allMineDocs],
  );
  const mineFolderPath = useMemo(() => {
    if (!mineFolderId) return [];
    const map = new Map(allMineDocs.map((d) => [d.id, d]));
    const path: DocNode[] = [];
    const seen = new Set<string>();
    let cursor = map.get(mineFolderId);
    while (cursor && !seen.has(cursor.id)) {
      path.unshift(cursor);
      seen.add(cursor.id);
      cursor = cursor.parentId ? map.get(cursor.parentId) : undefined;
    }
    return path;
  }, [allMineDocs, mineFolderId]);

  useEffect(() => {
    if (!tree || tab !== 'mine' || !mineFolderId) return;
    if (!allMineDocs.some((doc) => doc.id === mineFolderId && doc.isFolder)) {
      focusFolderLocation('mine', null);
    }
  }, [allMineDocs, focusFolderLocation, mineFolderId, tab, tree]);

  const list = (() => {
    if (!tree) return [];
    const raw =
      tab === 'mine'
        ? tree.mine
        : tab === 'public'
          ? tree.public
          : tab === 'shared'
            ? tree.shared
            : tree.favorites;
    if (!q) return raw;
    const kw = q.toLowerCase();
    return raw.filter((d) => d.title.toLowerCase().includes(kw));
  })();
  const displayList =
    tab === 'public' && !q
      ? list.filter((d) => (d.parentId ?? null) === publicFolderId)
      : tab === 'mine' && !q
        ? list.filter((d) => (d.parentId ?? null) === mineFolderId)
        : list;

  const treeNodes = useMemo(() => buildTree(list), [list]);
  const treeSupportsManage = tab === 'mine' || tab === 'public';
  const canDragMove = tab === 'mine' || (tab === 'public' && !!user?.role);
  const tabCounts = {
    mine: tree?.counts?.mine ?? tree?.mine.length ?? 0,
    public: tree?.counts?.public ?? tree?.public.length ?? 0,
    shared: tree?.counts?.shared ?? tree?.shared.length ?? 0,
    favorites: tree?.counts?.favorites ?? tree?.favorites.length ?? 0,
  };

  const toggleFavorite = async (doc: DocNode) => {
    try {
      if (doc.isFavorite) await api.delete(`/docs/${doc.id}/favorite`);
      else await api.post(`/docs/${doc.id}/favorite`);
      await load();
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const isAdmin = user?.role === 'ADMIN';
  const canManage = (doc: DocNode) => {
    if (tab === 'mine') return true; // 自己的私人工作区
    if (tab === 'public') return isAdmin || doc.createdById === user?.id;
    return false; // shared 给我看的，不允许在列表内删除
  };

  const openPublicFolder = (folderId: string | null) => {
    focusFolderLocation('public', folderId);
  };

  const openMineFolder = (folderId: string | null) => {
    focusFolderLocation('mine', folderId);
  };

  const draggableInGrid = (doc: DocNode) =>
    ((tab === 'public' && !!user?.role) || tab === 'mine') &&
    layout === 'grid' &&
    !q &&
    canManage(doc);

  const moveFolderOptions = useMemo(() => {
    const folders = tab === 'mine' ? mineFolders : publicFolders;
    const docs = tab === 'mine' ? allMineDocs : allPublicDocs;
    if (!moveTarget) return folders;
    if (!moveTarget.isFolder) {
      return folders.filter((folder) => folder.id !== moveTarget.id);
    }

    const blocked = new Set<string>([moveTarget.id]);
    const stack = [moveTarget.id];
    while (stack.length) {
      const currentId = stack.pop()!;
      docs.forEach((item) => {
        if (item.parentId === currentId) {
          blocked.add(item.id);
          if (item.isFolder) stack.push(item.id);
        }
      });
    }

    return folders.filter((folder) => !blocked.has(folder.id));
  }, [allMineDocs, allPublicDocs, mineFolders, moveTarget, publicFolders, tab]);

  return (
    <div className="py-6 sm:py-8 animate-fade-in-up">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl sm:text-[36px] font-serif font-bold text-text-primary mb-2">
            知识库
          </h1>
          <p className="text-text-secondary">私人空间用于个人沉淀；公共知识库面向所有注册用户。</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center bg-black/5 rounded-xl p-1 text-sm">
            <button
              onClick={() => setLayout('grid')}
              title="网格视图"
              className={`px-2 py-1.5 rounded-lg inline-flex items-center gap-1 transition-colors ${
                layout === 'grid'
                  ? 'bg-white shadow-sm text-text-primary'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <LayoutGrid size={14} /> 网格
            </button>
            <button
              onClick={() => setLayout('tree')}
              title="树形视图"
              className={`px-2 py-1.5 rounded-lg inline-flex items-center gap-1 transition-colors ${
                layout === 'tree'
                  ? 'bg-white shadow-sm text-text-primary'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <ListTree size={14} /> 树形
            </button>
          </div>
          <div className="relative group">
            <button
              onClick={() => {
                if (!createSubmitting) importInputRef.current?.click();
              }}
              disabled={createSubmitting}
              aria-describedby="docs-import-file-tip"
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-black/10 text-sm text-text-secondary hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {createSubmitting ? '处理中…' : '导入文件'}
            </button>
            <div
              id="docs-import-file-tip"
              role="tooltip"
              className="pointer-events-none absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs leading-5 text-text-secondary shadow-lg opacity-0 translate-y-1 transition-all group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0"
            >
              支持批量选择 Word (.docx)、Markdown (.md/.markdown)、纯文本 (.txt)
            </div>
          </div>
          <button
            onClick={() => {
              setCreateKind(tab === 'public' ? 'PUBLIC' : 'PRIVATE');
              setCreateTitle('未命名文档');
              setImportFailures([]);
              const currentFolderId = tab === 'public' ? publicFolderId : mineFolderId;
              setCreateOpen({ mode: 'create', parentId: currentFolderId });
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-liquid-indigo text-white text-sm font-medium hover:bg-primary transition-colors shadow-md shadow-liquid-indigo/20"
          >
            <Plus size={16} /> 新建文档
          </button>
        </div>
      </header>

      <input
        ref={importInputRef}
        type="file"
        accept=".docx,.md,.markdown,.txt"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) {
            setCreateKind(tab === 'public' ? 'PUBLIC' : 'PRIVATE');
            setImportIndex(0);
            setImportFailures([]);
            setCreateOpen({ mode: 'import', files });
          }
          e.target.value = '';
        }}
      />

      <div className="flex items-center gap-1 mb-4 bg-black/5 rounded-xl p-1 w-fit text-sm">
        {([
          { v: 'mine', label: '我的知识库', icon: Lock },
          { v: 'public', label: '公共知识库', icon: Globe },
          { v: 'shared', label: '共享给我', icon: Users },
          { v: 'favorites', label: '我的收藏', icon: Star },
        ] as const).map((t) => (
          <button
            key={t.v}
            onClick={() => {
              setTab(t.v);
              setPublicFolderId(null);
              setMineFolderId(null);
              syncFolderUrl(t.v, null);
            }}
            className={`px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-colors ${
              tab === t.v ? 'bg-white shadow-sm text-text-primary' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <t.icon size={14} /> {t.label}
            <span className="text-xs text-text-secondary">
              {tabCounts[t.v]}
            </span>
          </button>
        ))}
      </div>

      <div className="relative max-w-md mb-6">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索标题…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-black/10 bg-white/80 text-sm outline-none focus:border-liquid-indigo focus:ring-2 focus:ring-liquid-indigo/15"
        />
      </div>

      {tab === 'public' && !q && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 text-sm text-text-secondary">
            <button
              type="button"
              onClick={() => openPublicFolder(null)}
              className={`px-2 py-1 rounded-lg hover:bg-black/5 ${publicFolderId === null ? 'text-text-primary font-medium' : ''}`}
            >
              公共知识库
            </button>
            {publicFolderPath.map((folder) => (
              <span key={folder.id} className="inline-flex items-center gap-1">
                <span>/</span>
                <button
                  type="button"
                  onClick={() => openPublicFolder(folder.id)}
                  className={`px-2 py-1 rounded-lg hover:bg-black/5 ${folder.id === publicFolderId ? 'text-text-primary font-medium' : ''}`}
                >
                  {folder.title}
                </button>
              </span>
            ))}
          </div>
          <button
            onClick={() => {
              setCreateKind('PUBLIC');
              setCreateTitle('新建文件夹');
              setImportFailures([]);
              setCreateOpen({ mode: 'folder', parentId: publicFolderId });
            }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-black/10 bg-surface-container-lowest/80 text-sm text-text-secondary hover:bg-surface-container-lowest hover:text-text-primary"
          >
            <FolderPlus size={15} /> 新建文件夹
          </button>
        </div>
      )}

      {tab === 'mine' && !q && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 text-sm text-text-secondary">
            <button
              type="button"
              onClick={() => openMineFolder(null)}
              className={`px-2 py-1 rounded-lg hover:bg-black/5 ${mineFolderId === null ? 'text-text-primary font-medium' : ''}`}
            >
              我的知识库
            </button>
            {mineFolderPath.map((folder) => (
              <span key={folder.id} className="inline-flex items-center gap-1">
                <span>/</span>
                <button
                  type="button"
                  onClick={() => openMineFolder(folder.id)}
                  className={`px-2 py-1 rounded-lg hover:bg-black/5 ${folder.id === mineFolderId ? 'text-text-primary font-medium' : ''}`}
                >
                  {folder.title}
                </button>
              </span>
            ))}
          </div>
          <button
            onClick={() => {
              setCreateKind('PRIVATE');
              setCreateTitle('新建文件夹');
              setImportFailures([]);
              setCreateOpen({ mode: 'folder', parentId: mineFolderId });
            }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-black/10 bg-surface-container-lowest/80 text-sm text-text-secondary hover:bg-surface-container-lowest hover:text-text-primary"
          >
            <FolderPlus size={15} /> 新建文件夹
          </button>
        </div>
      )}

      {displayList.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-sm text-text-secondary text-center">
          {q
            ? '没有匹配的文档'
            : tab === 'mine'
              ? '私人知识库还没有内容，点击新建或导入开始记录'
              : tab === 'public'
                ? '公共知识库还没有内容，欢迎成为第一位贡献者'
                : tab === 'shared'
                  ? '暂时没有他人邀请你协作的文档'
                  : '还没有收藏任何文档，点击文档卡片上的星标即可收藏'}
        </div>
      ) : layout === 'tree' ? (
        <div className="glass-card rounded-2xl p-3">
          <DocTree
            tree={treeNodes}
            canManage={canManage}
            onSelect={(doc) => navigate(`/app/docs/${doc.id}`)}
            onCreateChild={
              treeSupportsManage
                ? (parent) => {
                    setCreateKind(tab === 'public' ? 'PUBLIC' : 'PRIVATE');
                    setCreateTitle('未命名文档');
                    setImportFailures([]);
                    setCreateOpen({
                      mode: 'create',
                      parentId: parent ? parent.id : null,
                    });
                  }
                : undefined
            }
            onRename={treeSupportsManage ? rename : undefined}
            onDelete={treeSupportsManage ? remove : undefined}
            onMove={canDragMove ? moveDoc : undefined}
            onCopyToPublic={tab === 'mine' ? copyToPublic : undefined}
            onMoveToPublic={tab === 'mine' ? moveToPublic : undefined}
            onMoveToPrivate={tab === 'public' && isAdmin ? moveToPrivate : undefined}
          />
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {displayList.map((doc) => (
            <li
              key={doc.id}
              className="relative group"
              draggable={draggableInGrid(doc)}
              onDragStart={(e) => {
                if (!draggableInGrid(doc)) return;
                e.dataTransfer.setData('text/plain', doc.id);
                e.dataTransfer.effectAllowed = 'move';
                setDraggingDocId(doc.id);
              }}
              onDragEnd={() => {
                setDraggingDocId(null);
                setDragOverFolderId(null);
              }}
              onDragOver={(e) => {
                if (!doc.isFolder || !draggingDocId || draggingDocId === doc.id) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverFolderId(doc.id);
              }}
              onDragLeave={(e) => {
                if (!doc.isFolder) return;
                const next = e.relatedTarget as Node | null;
                if (next && e.currentTarget.contains(next)) return;
                setDragOverFolderId((id) => (id === doc.id ? null : id));
              }}
              onDrop={(e) => {
                if (!doc.isFolder) return;
                e.preventDefault();
                e.stopPropagation();
                const draggedId = e.dataTransfer.getData('text/plain') || draggingDocId;
                setDraggingDocId(null);
                setDragOverFolderId(null);
                const sourceList = tab === 'mine' ? allMineDocs : allPublicDocs;
                const dragged = sourceList.find((item) => item.id === draggedId);
                if (dragged) void moveDoc(dragged, doc.id);
              }}
            >
              {(() => {
                const palette = doc.isFolder ? folderPalette(doc.id) : null;
                const over = doc.isFolder && dragOverFolderId === doc.id;
                return (
              <button
                onClick={() => {
                  if (doc.isFolder) {
                    if (tab === 'mine') openMineFolder(doc.id);
                    else openPublicFolder(doc.id);
                  } else navigate(`/app/docs/${doc.id}`);
                }}
                className={`glass-card rounded-xl p-4 w-full text-left flex items-start gap-3 border transition-all duration-200 ${
                  doc.isFolder
                    ? `${palette?.card ?? ''} ${over ? `scale-[1.06] -translate-y-1 ring-4 ${palette?.glow ?? ''} shadow-xl` : 'hover:shadow-md hover:-translate-y-0.5'}`
                    : `${draggingDocId === doc.id ? 'opacity-60 scale-[0.98]' : 'hover:shadow-md hover:-translate-y-0.5'} ${draggableInGrid(doc) ? 'cursor-grab active:cursor-grabbing' : ''}`
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${
                    doc.isFolder ? palette?.tile : 'bg-liquid-indigo/10 text-liquid-indigo border-liquid-indigo/10'
                  }`}
                >
                  {doc.isFolder ? <Folder size={18} /> : <FileText size={18} />}
                </div>
                <div className="min-w-0 flex-1 pr-10">
                  <div className="text-sm font-semibold text-text-primary truncate">{doc.title}</div>
                  <div className="text-xs text-text-secondary mt-1 truncate">
                    {doc.isFolder
                      ? over
                        ? '松开放入此文件夹'
                        : '文件夹'
                      : `更新于 ${new Date(doc.updatedAt).toLocaleString()}`}
                  </div>
                  {(tab === 'public' || tab === 'shared') && doc.createdBy && (
                    <div className="text-[11px] text-text-secondary mt-1 truncate">
                      {`上传者：${doc.createdBy.name}`}
                    </div>
                  )}
                </div>
              </button>
                );
              })()}
              <div className="absolute top-2 right-2 hidden group-hover:flex gap-0.5 bg-white/90 backdrop-blur rounded-lg border border-black/5 shadow-sm">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void toggleFavorite(doc);
                  }}
                  className={`p-1.5 rounded-md ${
                    doc.isFavorite
                      ? 'text-amber-500 hover:bg-amber-50'
                      : 'text-text-secondary hover:text-amber-500 hover:bg-amber-50'
                  }`}
                  title={doc.isFavorite ? '取消收藏' : '收藏'}
                >
                  <Star size={14} fill={doc.isFavorite ? 'currentColor' : 'none'} />
                </button>
                {canManage(doc) && (
                  <>
                    {(tab === 'public' || tab === 'mine') && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openMoveDialog(doc);
                        }}
                        className="p-1.5 text-text-secondary hover:text-liquid-indigo hover:bg-liquid-indigo/5 rounded-md"
                        title="移动到文件夹"
                      >
                        <Folder size={14} />
                      </button>
                    )}
                    {tab === 'mine' && !doc.isFolder && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void copyToPublic(doc);
                        }}
                        className="p-1.5 text-text-secondary hover:text-liquid-indigo hover:bg-liquid-indigo/5 rounded-md"
                        title="复制到公共知识库"
                      >
                        <Copy size={14} />
                      </button>
                    )}
                    {tab === 'mine' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void moveToPublic(doc);
                        }}
                        className="p-1.5 text-text-secondary hover:text-liquid-indigo hover:bg-liquid-indigo/5 rounded-md"
                        title="移动到公共知识库"
                      >
                        <FolderInput size={14} />
                      </button>
                    )}
                    {tab === 'public' && isAdmin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void moveToPrivate(doc);
                        }}
                        className="p-1.5 text-text-secondary hover:text-liquid-indigo hover:bg-liquid-indigo/5 rounded-md"
                        title="移到我的私密空间"
                      >
                        <FolderOutput size={14} />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        rename(doc);
                      }}
                      className="p-1.5 text-text-secondary hover:text-liquid-indigo hover:bg-liquid-indigo/5 rounded-md"
                      title="重命名"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(doc);
                      }}
                      className="p-1.5 text-text-secondary hover:text-red-500 hover:bg-red-50 rounded-md"
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
              {doc.isFavorite && (
                <span className="absolute top-2 left-2 text-amber-500 group-hover:hidden">
                  <Star size={14} fill="currentColor" />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!createOpen}
        title={
          createOpen?.mode === 'import'
            ? '导入到知识库'
            : createOpen?.mode === 'folder'
              ? '新建文件夹'
              : '新建文档'
        }
        onClose={() => {
          if (!createSubmitting) setCreateOpen(null);
        }}
      >
        {createOpen && (
          <div className="space-y-3">
            {(createOpen.mode === 'create' || createOpen.mode === 'folder') && (
              <div>
                <label className="text-xs text-text-secondary">
                  {createOpen.mode === 'folder' ? '文件夹名称' : '文档标题'}
                </label>
                <input
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-black/10 bg-white"
                />
              </div>
            )}
            {createOpen.mode === 'folder' ? (
              <div className="rounded-xl border border-liquid-indigo/15 bg-liquid-indigo/5 p-3 text-sm text-text-primary">
                {createKind === 'PRIVATE' ? (
                  <>
                    <div className="flex items-center gap-2 font-medium">
                      <Lock size={14} /> 我的私人知识库
                    </div>
                    <div className="text-xs text-text-secondary mt-1">
                      文件夹用于整理私人知识库，仅自己可见。
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 font-medium">
                      <Globe size={14} /> 公共知识库
                    </div>
                    <div className="text-xs text-text-secondary mt-1">
                      文件夹用于整理公共知识库，所有注册用户可查看其中的文档。
                    </div>
                  </>
                )}
              </div>
            ) : (
            <div>
              <label className="text-xs text-text-secondary">保存到</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setCreateKind('PRIVATE')}
                  disabled={createSubmitting}
                  className={`text-left p-3 rounded-xl border ${
                    createKind === 'PRIVATE' ? 'border-liquid-indigo bg-liquid-indigo/5' : 'border-black/10'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Lock size={14} /> 我的私人知识库
                  </div>
                  <div className="text-xs text-text-secondary mt-1">仅自己可见</div>
                </button>
                <button
                  onClick={() => setCreateKind('PUBLIC')}
                  disabled={createSubmitting}
                  className={`text-left p-3 rounded-xl border ${
                    createKind === 'PUBLIC' ? 'border-liquid-indigo bg-liquid-indigo/5' : 'border-black/10'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Globe size={14} /> 公共知识库
                  </div>
                  <div className="text-xs text-text-secondary mt-1">
                    所有注册用户可查看，你将成为文档所有者
                  </div>
                </button>
              </div>
            </div>
            )}
            {createOpen.mode === 'import' && createOpen.files && (
              <div className="space-y-2 rounded-xl border border-black/10 p-3">
                <div className="flex items-center justify-between text-xs text-text-secondary">
                  <span>待导入文件</span>
                  <span>
                    {createSubmitting
                      ? `${Math.min(importIndex + 1, createOpen.files.length)} / ${createOpen.files.length}`
                      : `${createOpen.files.length} 个`}
                  </span>
                </div>
                <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                  {createOpen.files.map((file, index) => (
                    <div
                      key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                      className="flex items-center gap-2 rounded-lg bg-black/[0.03] px-2 py-1.5 text-xs text-text-secondary"
                    >
                      {createSubmitting && index === importIndex ? (
                        <Loader2 size={12} className="animate-spin text-liquid-indigo" />
                      ) : (
                        <FileText size={12} />
                      )}
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <span>{(file.size / 1024).toFixed(1)} KB</span>
                    </div>
                  ))}
                </div>
                {importFailures.length > 0 && (
                  <div className="space-y-1 rounded-lg bg-red-50 px-2 py-2 text-xs text-red-600">
                    {importFailures.map((failure) => (
                      <div key={failure}>{failure}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setCreateOpen(null)}
                disabled={createSubmitting}
                className="px-3 py-1.5 rounded-lg border border-black/10 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {importFailures.length > 0 ? '关闭' : '取消'}
              </button>
              <button
                onClick={submitCreate}
                disabled={createSubmitting || importFailures.length > 0}
                className="inline-flex min-w-20 items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg bg-liquid-indigo text-white text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {createSubmitting && <Loader2 size={14} className="animate-spin" />}
                {createSubmitting
                  ? createOpen.mode === 'import'
                    ? createOpen.files && createOpen.files.length > 1
                      ? `导入中 ${Math.min(importIndex + 1, createOpen.files.length)}/${createOpen.files.length}`
                      : '导入中…'
                    : '创建中…'
                  : createOpen.mode === 'import'
                    ? '导入'
                    : '创建'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!moveTarget}
        title="移动到文件夹"
        onClose={() => setMoveTarget(null)}
      >
        {moveTarget && (
          <div className="space-y-4">
            <div className="text-sm text-text-primary">
              将「{moveTarget.title}」移动到：
            </div>
            <select
              value={moveFolderId ?? ''}
              onChange={(e) => setMoveFolderId(e.target.value || null)}
              className="w-full px-3 py-2 rounded-lg border border-black/10 bg-white text-sm"
            >
              <option value="">{tab === 'mine' ? '我的知识库根目录' : '公共知识库根目录'}</option>
              {moveFolderOptions.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.title}
                  </option>
                ))}
            </select>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setMoveTarget(null)}
                className="px-3 py-1.5 rounded-lg border border-black/10 text-sm"
              >
                取消
              </button>
              <button
                onClick={submitMoveToFolder}
                className="px-4 py-1.5 rounded-lg bg-liquid-indigo text-white text-sm"
              >
                移动
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
