import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  Trash2,
  Users,
  History,
  Paperclip,
  Download,
  Upload,
  Star,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { api, asApiError, downloadFromApi, uploadFile } from '../../lib/api';
import { useUiStore } from '../../store/ui';
import { useAuthStore } from '../../store/auth';
import { RichEditor, type RichEditorRef } from '../../editor/Editor';
import type { Attachment, DocAccess, DocDetail, DocumentComment } from '../../lib/types';
import { ShareDialog } from '../../components/ShareDialog';
import { VersionDrawer } from '../../components/VersionDrawer';
import { PresenceIndicator } from '../../components/PresenceIndicator';
import { DocumentToc } from '../../components/docs/DocumentToc';
import { ConflictResolver, type DocConflict } from '../../components/docs/ConflictResolver';
import { displayFilename } from '../../lib/filename';
import type { EditorHeading } from '../../editor/Editor';

interface BuiltinFont {
  family: string;
  license: string;
}

interface UserFont {
  id: string;
  family: string;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch);
}

function htmlWithAbsoluteImages(html: string) {
  const box = document.createElement('div');
  box.innerHTML = html;
  box.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src');
    if (src?.startsWith('/')) img.setAttribute('src', `${window.location.origin}${src}`);
  });
  return box.innerHTML;
}


function docsListPathForDoc(
  doc: Pick<DocDetail, 'parentId' | 'workspace'> & { workspace?: DocDetail['workspace'] },
  access: DocAccess | null | undefined,
  meId?: string,
) {
  const tab = access?.isPublic
    ? 'public'
    : doc.workspace?.ownerId === meId
      ? 'mine'
      : 'shared';
  const params = new URLSearchParams({ tab });
  // shared 列表不按文件夹浏览；mine/public 回到文档所在文件夹
  if (tab !== 'shared' && doc.parentId) {
    params.set('folder', doc.parentId);
  }
  return `/app/docs?${params.toString()}`;
}

export function DocDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const showToast = useUiStore((s) => s.showToast);
  const confirmDialog = useUiStore((s) => s.confirmDialog);
  const me = useAuthStore((s) => s.user);

  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [access, setAccess] = useState<DocAccess>({
    role: 'VIEWER',
    canRead: true,
    canWrite: false,
    canDelete: false,
    canInvite: false,
    isPublic: false,
  });
  const role = access.role;
  const location = useLocation();
  // 列表页打开文档时会把来源位置（tab/文件夹）放在路由 state 里，返回时优先原样带回；
  // 没有来源信息（直达链接、仪表盘等）时才回退到按文档归属推断的旧逻辑。
  const docsFrom = (
    location.state as { docsFrom?: { tab?: string; folder?: string | null } } | null
  )?.docsFrom;
  const backToList = useCallback(() => {
    const tab = docsFrom?.tab;
    if (tab && ['mine', 'public', 'shared', 'favorites'].includes(tab)) {
      const params = new URLSearchParams();
      if (tab !== 'mine') params.set('tab', tab);
      if (docsFrom?.folder) params.set('folder', docsFrom.folder);
      const qs = params.toString();
      navigate(qs ? `/app/docs?${qs}` : '/app/docs');
    } else if (doc) {
      navigate(docsListPathForDoc(doc, access, me?.id));
    } else {
      navigate('/app/docs');
    }
  }, [navigate, docsFrom, doc, access, me?.id]);
  const [title, setTitle] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty' | 'conflict'>('saved');
  const [conflict, setConflict] = useState<DocConflict | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [fonts, setFonts] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [comments, setComments] = useState<DocumentComment[]>([]);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [anchorDraft, setAnchorDraft] = useState('');
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [shareOpen, setShareOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [headings, setHeadings] = useState<EditorHeading[]>([]);
  const [uploadBusy, setUploadBusy] = useState<'image' | 'attachment' | 'import' | null>(null);
  const editorRef = useRef<RichEditorRef>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<number | null>(null);
  const draftRef = useRef<{ title?: string; contentJson?: string }>({});
  const updatedAtRef = useRef<string | null>(null);
  const titleRef = useRef('');
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const conflictRef = useRef(false);
  const uploadBusyRef = useRef(false);

  const canWrite = access.canWrite;
  const canDelete = access.canDelete;
  const canInvite = access.canInvite;

  const flushSave = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!id) return;
      while (saveInFlightRef.current) await saveInFlightRef.current;
      if (!opts?.force && conflictRef.current) return;

      const draft = { ...draftRef.current };
      if (!opts?.force && draft.title === undefined && draft.contentJson === undefined) return;

      const request = (async () => {
        setSaveStatus('saving');
        try {
          const payload = {
            ...(opts?.force
              ? { title: titleRef.current, contentJson: editorRef.current?.editor?.getHTML() ?? '' }
              : draft),
            ...(opts?.force ? { force: true } : { expectedUpdatedAt: updatedAtRef.current ?? undefined }),
          };
          const { data } = await api.patch<{ doc: DocDetail }>(`/docs/${id}`, payload);

          // Only remove fields included in this request. Edits made while it was saving stay queued.
          if (draft.title !== undefined && draftRef.current.title === draft.title) {
            delete draftRef.current.title;
          }
          if (draft.contentJson !== undefined && draftRef.current.contentJson === draft.contentJson) {
            delete draftRef.current.contentJson;
          }
          updatedAtRef.current = data.doc.updatedAt;
          setDoc(data.doc);
          const hasPendingDraft =
            draftRef.current.title !== undefined || draftRef.current.contentJson !== undefined;
          setSaveStatus(hasPendingDraft ? 'dirty' : 'saved');
        } catch (err) {
          const apiErr = asApiError(err);
          if (apiErr.code === 'DOC_CONFLICT') {
            const remoteDoc = (apiErr.details as { doc: DocDetail } | undefined)?.doc;
            if (remoteDoc) {
              conflictRef.current = true;
              setConflict({
                mine: {
                  title: titleRef.current,
                  contentJson: editorRef.current?.editor?.getHTML() ?? draftRef.current.contentJson ?? '',
                },
                remote: { title: remoteDoc.title, contentJson: remoteDoc.contentJson },
              });
              setConflictOpen(true);
              updatedAtRef.current = remoteDoc.updatedAt;
            }
            setSaveStatus('conflict');
            return;
          }
          setSaveStatus('dirty');
          showToast(apiErr.error, 'error');
        }
      })();

      saveInFlightRef.current = request;
      try {
        await request;
      } finally {
        if (saveInFlightRef.current === request) saveInFlightRef.current = null;
      }
    },
    [id, showToast],
  );

  const scheduleSave = useCallback(() => {
    if (!canWrite) return;
    // 冲突未解决期间暂停自动保存，避免继续打字触发新保存覆盖冲突状态
    if (conflict) return;
    setSaveStatus('dirty');
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void flushSave();
    }, 1000);
  }, [flushSave, canWrite, conflict]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      void flushSave();
    };
  }, [flushSave]);

  const loadAttachments = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await api.get<{ list: Attachment[] }>('/attachments', {
        params: { documentId: id },
      });
      setAttachments(data.list);
    } catch {
      /* ignore */
    }
  }, [id]);

  const loadComments = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await api.get<{ list: DocumentComment[] }>(`/docs/${id}/comments`);
      setComments(data.list);
    } catch {
      /* 评论不影响文档阅读 */
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [docRes, fontsRes, userFontsRes, treeRes] = await Promise.all([
          api.get<{ doc: DocDetail; role: DocAccess['role']; access: DocAccess }>(`/docs/${id}`),
          api.get<{ list: BuiltinFont[] }>('/fonts/builtin'),
          api.get<{ list: UserFont[] }>('/fonts'),
          api.get<{ favorites: { id: string }[] }>('/docs/tree'),
        ]);
        if (docRes.data.doc.isFolder) {
          const nextTab = docRes.data.access.isPublic
            ? 'public'
            : docRes.data.doc.workspace?.ownerId === me?.id
              ? 'mine'
              : 'shared';
          const fromTab = docsFrom?.tab;
          const effectiveTab =
            fromTab && ['mine', 'public', 'shared', 'favorites'].includes(fromTab) ? fromTab : nextTab;
          navigate(
            effectiveTab === 'shared' ? '/app/docs?tab=shared' : `/app/docs?tab=${effectiveTab}&folder=${docRes.data.doc.id}`,
            { replace: true },
          );
          return;
        }
        setDoc(docRes.data.doc);
        setAccess(docRes.data.access);
        setTitle(docRes.data.doc.title);
        titleRef.current = docRes.data.doc.title;
        updatedAtRef.current = docRes.data.doc.updatedAt;
        conflictRef.current = false;
        setConflict(null);
        setConflictOpen(false);
        setIsFavorite(!!treeRes.data.favorites.find((f) => f.id === id));
        const families = [
          ...fontsRes.data.list.map((f) => f.family),
          ...userFontsRes.data.list.map((f) => f.family),
        ];
        setFonts(families);
        void loadAttachments();
        void loadComments();
      } catch (err) {
        showToast(asApiError(err).error, 'error');
        backToList();
      }
    })();
  }, [id, me?.id, navigate, showToast, loadAttachments, loadComments, backToList]);

  const handleTitle = (v: string) => {
    if (!canWrite) return;
    setTitle(v);
    titleRef.current = v;
    draftRef.current.title = v;
    scheduleSave();
  };

  const handleContent = (json: string) => {
    if (!canWrite) return;
    draftRef.current.contentJson = json;
    scheduleSave();
  };

  const remove = async () => {
    if (!id || !doc) return;
    const ok = await confirmDialog({
      title: '删除文档',
      message: `确认删除文档「${title}」？此操作不可恢复。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/docs/${id}`);
      backToList();
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const insertImage = async (file: File) => {
    if (!id || !canWrite || uploadBusyRef.current) return;
    uploadBusyRef.current = true;
    setUploadBusy('image');
    try {
      const data = await uploadFile<{ attachment: Attachment }>(
        '/attachments/upload-image',
        file,
        { documentId: id, category: 'doc-image' },
      );
      editorRef.current?.editor
        ?.chain()
        .focus()
        .setImage({ src: data.attachment.url, alt: displayFilename(data.attachment.originalName) })
        .run();
      void loadAttachments();
      showToast('图片已插入', 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      uploadBusyRef.current = false;
      setUploadBusy(null);
    }
  };

  const insertPastedImages = async (files: File[]) => {
    for (const file of files) {
      await insertImage(file);
    }
  };

  const insertAttachment = async (file: File) => {
    if (!id || !canWrite || uploadBusyRef.current) return;
    uploadBusyRef.current = true;
    setUploadBusy('attachment');
    try {
      const data = await uploadFile<{ attachment: Attachment }>(
        '/attachments/upload',
        file,
        { documentId: id, category: 'doc-file' },
      );
      const sizeKb = (data.attachment.size / 1024).toFixed(1);
      const filename = displayFilename(data.attachment.originalName);
      editorRef.current?.editor
        ?.chain()
        .focus()
        .insertContent(
          `<p><a href="${data.attachment.url}" target="_blank" rel="noopener">📎 ${escapeHtml(filename)} (${sizeKb} KB)</a></p>`,
        )
        .run();
      void loadAttachments();
      showToast('附件已插入', 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      uploadBusyRef.current = false;
      setUploadBusy(null);
    }
  };

  const importDoc = async (file: File) => {
    if (!doc || uploadBusyRef.current) return;
    uploadBusyRef.current = true;
    setUploadBusy('import');
    try {
      const data = await uploadFile<{ doc: DocDetail }>('/docs/import', file, {
        workspaceId: doc.workspaceId,
        parentId: doc?.parentId ?? null,
      });
      showToast('已导入为新文档', 'success');
      navigate(`/app/docs/${data.doc.id}`, { state: location.state });
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      uploadBusyRef.current = false;
      setUploadBusy(null);
    }
  };

  const exportAs = async (format: 'md' | 'docx' | 'html') => {
    if (!id) return;
    try {
      await downloadFromApi(`/docs/${id}/export?format=${format}`, `${title || '文档'}.${format}`);
      showToast(`已导出 ${format.toUpperCase()}`, 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      setExportOpen(false);
    }
  };

  const printPdf = async () => {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      showToast('浏览器阻止了打印窗口，请允许弹窗后重试', 'error');
      return;
    }
    await flushSave();
    setExportOpen(false);
    const contentHtml = htmlWithAbsoluteImages(editorRef.current?.editor?.getHTML() ?? doc?.contentJson ?? '');
    const attachmentHtml = attachments.length
      ? `<section class="attachments"><h2>文档附件</h2><ul>${attachments
          .map((a) => {
            const name = displayFilename(a.originalName);
            const url = `${window.location.origin}${a.url}?download=1`;
            return `<li><a href="${url}">${escapeHtml(name)}</a><span>${(a.size / 1024).toFixed(1)} KB</span></li>`;
          })
          .join('')}</ul></section>`
      : '';
    printWindow.document.open();
    printWindow.document.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title || '文档')}</title>
    <style>
      @page { size: A4; margin: 0; }
      html, body { margin: 0; padding: 0; background: #fff; color: #000; }
      body { font-family: ui-serif, Georgia, 'Times New Roman', 'Noto Serif CJK SC', serif; }
      .page { box-sizing: border-box; width: 210mm; min-height: 297mm; padding: 18mm 14mm; }
      h1 { margin: 0 0 14mm; font-size: 26pt; line-height: 1.25; font-weight: 700; }
      .content { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12pt; line-height: 1.75; }
      .content img { max-width: 100%; height: auto; page-break-inside: avoid; }
      .content table { max-width: 100%; border-collapse: collapse; }
      .content td, .content th { border: 1px solid #ddd; padding: 4px 6px; }
      .content pre { white-space: pre-wrap; word-break: break-word; }
      .attachments { margin-top: 12mm; border-top: 1px solid #ddd; padding-top: 6mm; font-family: ui-sans-serif, system-ui, sans-serif; }
      .attachments h2 { font-size: 12pt; margin: 0 0 4mm; }
      .attachments ul { margin: 0; padding-left: 18px; }
      .attachments li { margin: 2mm 0; }
      .attachments span { margin-left: 8px; color: #666; font-size: 10pt; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>
  </head>
  <body>
    <article class="page">
      <h1>${escapeHtml(title || '未命名文档')}</h1>
      <main class="content">${contentHtml}</main>
      ${attachmentHtml}
    </article>
    <script>
      window.addEventListener('load', () => setTimeout(() => { window.focus(); window.print(); }, 100));
    </script>
  </body>
</html>`);
    printWindow.document.close();
  };

  const removeAttachment = async (att: Attachment) => {
    const ok = await confirmDialog({
      title: '删除附件',
      message: `删除附件「${displayFilename(att.originalName)}」？`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/attachments/${att.id}`);
      void loadAttachments();
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const downloadAttachment = async (att: Attachment) => {
    try {
      await downloadFromApi(`/attachments/${att.id}/raw?download=1`, displayFilename(att.originalName));
    } catch (err) {
      showToast(asApiError(err).error || '附件下载失败', 'error');
    }
  };

  const addComment = async (parentId?: string) => {
    if (!id) return;
    const body = (parentId ? replyDraft[parentId] : commentDraft).trim();
    if (!body) {
      showToast('请输入评论内容', 'error');
      return;
    }
    const selectedText = window.getSelection()?.toString().trim().slice(0, 300) || '';
    try {
      await api.post(`/docs/${id}/comments`, {
        body,
        parentId,
        anchorText: parentId ? undefined : anchorDraft.trim() || selectedText || undefined,
      });
      if (parentId) setReplyDraft((prev) => ({ ...prev, [parentId]: '' }));
      else {
        setCommentDraft('');
        setAnchorDraft('');
      }
      await loadComments();
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const resolveComment = async (commentId: string, resolved: boolean) => {
    if (!id) return;
    try {
      await api.patch(`/docs/${id}/comments/${commentId}`, { resolved });
      await loadComments();
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!id) return;
    try {
      await api.delete(`/docs/${id}/comments/${commentId}`);
      await loadComments();
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const onRestored = async () => {
    if (!id) return;
    try {
      const { data } = await api.get<{ doc: DocDetail }>(`/docs/${id}`);
      setDoc(data.doc);
      setTitle(data.doc.title);
      titleRef.current = data.doc.title;
      updatedAtRef.current = data.doc.updatedAt;
      conflictRef.current = false;
      editorRef.current?.setContent(data.doc.contentJson);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  // 冲突处理：用我的本地修改强制覆盖服务端
  const handleOverwriteMine = async () => {
    setConflictOpen(false);
    await flushSave({ force: true });
    conflictRef.current = false;
    setConflict(null);
    if (draftRef.current.title !== undefined || draftRef.current.contentJson !== undefined) {
      setSaveStatus('dirty');
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => void flushSave(), 1000);
    }
  };

  // 冲突处理：丢弃本地修改，加载服务端最新版本
  const handleLoadRemote = async () => {
    if (!conflict) return;
    editorRef.current?.setContent(conflict.remote.contentJson);
    setTitle(conflict.remote.title);
    titleRef.current = conflict.remote.title;
    draftRef.current = {};
    setDoc((d) => (d ? { ...d, title: conflict.remote.title, contentJson: conflict.remote.contentJson } : d));
    conflictRef.current = false;
    setConflict(null);
    setConflictOpen(false);
    setSaveStatus('saved');
    showToast('已加载最新版本', 'success');
  };

  const handleCloseConflict = () => {
    setConflictOpen(false);
    // 保持 saveStatus='conflict' 与徽章，用户可通过徽章重新打开
  };

  const initial = useMemo(() => doc?.contentJson ?? '', [doc?.id]);
  const unresolvedComments = comments.filter((c) => !c.resolvedAt);
  const rootComments = comments.filter((c) => !c.parentId);

  return (
    <div className="py-4 sm:py-6 animate-fade-in-up">
      <div className="no-print flex items-center justify-between mb-4 gap-2 flex-wrap">
        <button
          onClick={backToList}
          className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-liquid-indigo transition-colors"
        >
          <ChevronLeft size={16} /> 返回文档列表
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          {doc && me && (
            <PresenceIndicator resourceType="doc" resourceId={doc.id} selfId={me.id} />
          )}
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              role === 'OWNER'
                ? 'bg-liquid-indigo/10 text-liquid-indigo'
                : role === 'EDITOR'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700'
            }`}
          >
            {role === 'OWNER' ? '所有者' : role === 'EDITOR' ? '可编辑' : '仅查看'}
          </span>
          {saveStatus === 'conflict' ? (
            <button
              onClick={() => setConflictOpen(true)}
              className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 text-red-600 hover:bg-red-100"
            >
              <AlertTriangle size={12} /> 文档已被他人修改，点击查看
            </button>
          ) : (
            <span
              className={`text-xs ${
                saveStatus === 'saved'
                  ? 'text-emerald-600'
                  : saveStatus === 'saving'
                    ? 'text-text-secondary'
                    : 'text-amber-600'
              }`}
            >
              {!canWrite ? '只读' : saveStatus === 'saved' ? '已保存' : saveStatus === 'saving' ? '正在保存…' : '待保存'}
            </span>
          )}
          {uploadBusy && (
            <span className="text-xs px-2 py-1 rounded-full bg-liquid-indigo/10 text-liquid-indigo">
              {uploadBusy === 'image' ? '图片上传中…' : uploadBusy === 'attachment' ? '附件上传中…' : '导入中…'}
            </span>
          )}
          {doc && (
            <>
              <button
                onClick={async () => {
                  try {
                    if (isFavorite) await api.delete(`/docs/${doc.id}/favorite`);
                    else await api.post(`/docs/${doc.id}/favorite`);
                    setIsFavorite(!isFavorite);
                  } catch (err) {
                    showToast(asApiError(err).error, 'error');
                  }
                }}
                title={isFavorite ? '取消收藏' : '收藏'}
                className={`p-2 rounded-lg ${
                  isFavorite ? 'text-amber-500 bg-amber-50' : 'text-text-secondary hover:bg-black/5'
                }`}
              >
                <Star size={14} fill={isFavorite ? 'currentColor' : 'none'} />
              </button>
              <div className="relative">
                <button
                  onClick={() => setExportOpen((v) => !v)}
                  onBlur={() => window.setTimeout(() => setExportOpen(false), 200)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-black/10 text-text-secondary hover:bg-black/5"
                >
                  <Download size={14} /> 导出
                </button>
                {exportOpen && (
                  <div className="absolute right-0 mt-1 w-44 bg-white border border-black/5 rounded-lg shadow-lg z-20 py-1 text-sm">
                    <button
                      onMouseDown={() => exportAs('md')}
                      className="w-full text-left px-3 py-1.5 hover:bg-black/5"
                    >
                      Markdown (.md)
                    </button>
                    <button
                      onMouseDown={() => exportAs('docx')}
                      className="w-full text-left px-3 py-1.5 hover:bg-black/5"
                    >
                      Word (.docx)
                    </button>
                    <button
                      onMouseDown={() => exportAs('html')}
                      className="w-full text-left px-3 py-1.5 hover:bg-black/5"
                    >
                      HTML (.html)
                    </button>
                    <button
                      onMouseDown={printPdf}
                      className="w-full text-left px-3 py-1.5 hover:bg-black/5"
                    >
                      打印 / 另存为 PDF
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => setShareOpen(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-black/10 text-text-secondary hover:bg-black/5"
              >
                <Users size={14} /> 分享
              </button>
              <button
                onClick={() => setVersionOpen(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-black/10 text-text-secondary hover:bg-black/5"
              >
                <History size={14} /> 历史
              </button>
              <button
                onClick={() => setCommentsOpen(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-black/10 text-text-secondary hover:bg-black/5"
              >
                <MessageSquare size={14} /> 评论
                {unresolvedComments.length > 0 && (
                  <span className="ml-0.5 rounded-full bg-liquid-indigo/10 px-1.5 py-0.5 text-[10px] text-liquid-indigo">
                    {unresolvedComments.length}
                  </span>
                )}
              </button>
            </>
          )}
          {canDelete && (
            <button
              onClick={remove}
              className="p-2 rounded-lg text-text-secondary hover:bg-black/5 hover:text-red-500 transition-colors"
              title="删除文档"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {doc && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="doc-print-area bg-paper-white rounded-2xl shadow-sm border border-black/5 p-4 sm:p-8 lg:p-12">
            <input
              value={title}
              onChange={(e) => handleTitle(e.target.value)}
              placeholder="未命名文档"
              disabled={!canWrite}
              className="w-full text-3xl sm:text-[40px] font-serif font-bold text-text-primary mb-6 bg-transparent outline-none placeholder-black/20 disabled:opacity-90"
            />
            <RichEditor
              ref={editorRef}
              initialContent={initial}
              onChange={handleContent}
              onHeadingsChange={setHeadings}
              fontFamilies={fonts}
              editable={canWrite}
              onPasteImages={canWrite ? insertPastedImages : undefined}
              handlers={
                canWrite && !uploadBusy
                  ? {
                      onUploadImage: () => imageInputRef.current?.click(),
                      onUploadAttachment: () => attachInputRef.current?.click(),
                      onImportFile: () => importInputRef.current?.click(),
                    }
                  : undefined
              }
            />

            {attachments.length > 0 && (
              <div className="print-attachments mt-6 pt-6 border-t border-black/5">
                <div className="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2">
                  <Paperclip size={14} /> 文档附件
                </div>
                <ul className="space-y-2">
                  {attachments.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-black/[0.03] group"
                    >
                      {a.mimeType.startsWith('image/') ? (
                        <img src={a.url} alt={displayFilename(a.originalName)} className="w-10 h-10 rounded object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-liquid-indigo/10 text-liquid-indigo flex items-center justify-center">
                          <Paperclip size={16} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 text-sm">
                          <div className="font-medium text-text-primary truncate">{displayFilename(a.originalName)}</div>
                        <div className="text-xs text-text-secondary">
                          {(a.size / 1024).toFixed(1)} KB · {new Date(a.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => downloadAttachment(a)}
                        className="p-1.5 text-text-secondary hover:text-liquid-indigo"
                        title="下载"
                      >
                        <Download size={14} />
                      </button>
                      {canWrite && (
                        <button
                          onClick={() => removeAttachment(a)}
                          className="p-1.5 text-text-secondary hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DocumentToc headings={headings} />
        </div>
      )}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        disabled={!!uploadBusy}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void insertImage(file);
          e.target.value = '';
        }}
      />
      <input
        ref={attachInputRef}
        type="file"
        disabled={!!uploadBusy}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void insertAttachment(file);
          e.target.value = '';
        }}
      />
      <input
        ref={importInputRef}
        type="file"
        accept=".docx,.md,.markdown,.txt,.pdf"
        disabled={!!uploadBusy}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importDoc(file);
          e.target.value = '';
        }}
      />

      {doc && (
        <>
          <ShareDialog
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            resourceType="doc"
            resourceId={doc.id}
            canManage={canInvite}
          />
          <VersionDrawer
            open={versionOpen}
            onClose={() => setVersionOpen(false)}
            docId={doc.id}
            canWrite={canWrite}
            onRestored={onRestored}
          />
          <ConflictResolver
            conflict={conflict}
            onOverwriteMine={handleOverwriteMine}
            onLoadRemote={handleLoadRemote}
            onClose={handleCloseConflict}
          />
          {commentsOpen && (
            <div className="no-print fixed inset-y-0 right-0 z-40 w-full max-w-md bg-white shadow-2xl border-l border-black/10 flex flex-col">
              <div className="px-4 py-3 border-b border-black/5 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-text-primary">文档评论</div>
                  <div className="text-xs text-text-secondary">
                    可给选中文本或段落补充讨论，回复会串在同一条下。
                  </div>
                </div>
                <button
                  onClick={() => setCommentsOpen(false)}
                  className="text-sm text-text-secondary hover:text-text-primary"
                >
                  关闭
                </button>
              </div>
              <div className="p-4 border-b border-black/5 space-y-2">
                <input
                  value={anchorDraft}
                  onChange={(e) => setAnchorDraft(e.target.value)}
                  placeholder="关联文本（可留空，自动使用当前选中文本）"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-black/10 bg-white"
                />
                <textarea
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  rows={3}
                  placeholder="写一条评论"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-black/10 bg-white"
                />
                <div className="flex justify-end">
                  <button
                    onClick={() => addComment()}
                    className="px-3 py-1.5 rounded-lg bg-liquid-indigo text-white text-sm"
                  >
                    添加评论
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {rootComments.length === 0 ? (
                  <div className="text-sm text-text-secondary text-center py-10">暂无评论</div>
                ) : (
                  rootComments.map((comment) => {
                    const replies = comments.filter((c) => c.parentId === comment.id);
                    return (
                      <div
                        key={comment.id}
                        className={`rounded-xl border p-3 ${
                          comment.resolvedAt ? 'border-emerald-100 bg-emerald-50/40' : 'border-black/5'
                        }`}
                      >
                        {comment.anchorText && (
                          <div className="text-xs text-text-secondary bg-black/[0.03] rounded-lg px-2 py-1 mb-2">
                            {comment.anchorText}
                          </div>
                        )}
                        <div className="text-sm text-text-primary whitespace-pre-wrap">{comment.body}</div>
                        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-text-secondary">
                          <span>
                            {comment.author.name} · {new Date(comment.createdAt).toLocaleString('zh-CN')}
                          </span>
                          <span className="flex items-center gap-2">
                            <button
                              onClick={() => resolveComment(comment.id, !comment.resolvedAt)}
                              className="hover:text-liquid-indigo inline-flex items-center gap-1"
                            >
                              <CheckCircle2 size={12} />
                              {comment.resolvedAt ? '重新打开' : '解决'}
                            </button>
                            <button
                              onClick={() => deleteComment(comment.id)}
                              className="hover:text-red-500"
                            >
                              删除
                            </button>
                          </span>
                        </div>
                        {replies.length > 0 && (
                          <div className="mt-3 pl-3 border-l border-black/10 space-y-2">
                            {replies.map((reply) => (
                              <div key={reply.id} className="text-sm">
                                <div className="whitespace-pre-wrap">{reply.body}</div>
                                <div className="text-[11px] text-text-secondary mt-0.5">
                                  {reply.author.name} · {new Date(reply.createdAt).toLocaleString('zh-CN')}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="mt-3 flex gap-2">
                          <input
                            value={replyDraft[comment.id] ?? ''}
                            onChange={(e) =>
                              setReplyDraft((prev) => ({ ...prev, [comment.id]: e.target.value }))
                            }
                            placeholder="回复"
                            className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-black/10"
                          />
                          <button
                            onClick={() => addComment(comment.id)}
                            className="px-2 py-1.5 rounded-lg border border-black/10 text-xs"
                          >
                            发送
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
