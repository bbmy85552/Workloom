import { useCallback, useEffect, useState } from 'react';
import { Copy, Eye, Link2, Trash2 } from 'lucide-react';
import { api, asApiError } from '../lib/api';
import { useUiStore } from '../store/ui';
import { useAuthStore } from '../store/auth';
import { Modal } from './Modal';
import { ShareViewsModal } from './ShareViewsModal';
import { Avatar, UserPicker } from './UserPicker';
import type { Collaborator, ShareLink, UserSearchItem } from '../lib/types';

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  resourceType: 'doc' | 'table' | 'memory';
  resourceId: string;
  canManage: boolean;
  canShareLinks?: boolean;
  resourceTitle?: string;
}

function collaboratorBase(resourceType: ShareDialogProps['resourceType'], resourceId: string) {
  if (resourceType === 'doc') return `/docs/${resourceId}/collaborators`;
  if (resourceType === 'memory') return `/memory/projects/${resourceId}/collaborators`;
  return `/tables/${resourceId}/collaborators`;
}

const RESOURCE_LABEL: Record<ShareDialogProps['resourceType'], string> = {
  doc: '文档',
  table: '表格',
  memory: '项目记忆',
};

export function ShareDialog({ open, onClose, resourceType, resourceId, canManage, canShareLinks, resourceTitle }: ShareDialogProps) {
  // 链接分享可单独授权（公共文档的普通编辑者）：只开链接区，协作者管理仍归 canManage
  const canShare = canShareLinks ?? canManage;
  // 项目记忆只支持协作者，不支持公开分享链接
  const supportsLinks = resourceType !== 'memory';
  const showToast = useUiStore((s) => s.showToast);
  const me = useAuthStore((s) => s.user);
  const confirmDialog = useUiStore((s) => s.confirmDialog);
  const alertDialog = useUiStore((s) => s.alertDialog);
  const [owner, setOwner] = useState<UserSearchItem | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkRole, setLinkRole] = useState<'view' | 'edit'>('view');
  const [linkTrack, setLinkTrack] = useState(false);
  const [viewsLink, setViewsLink] = useState<ShareLink | null>(null);
  const [highlightCombo, setHighlightCombo] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const collabRes = await api.get<{ owner: UserSearchItem; collaborators: Collaborator[] }>(
        collaboratorBase(resourceType, resourceId),
      );
      setOwner(collabRes.data.owner);
      setCollaborators(collabRes.data.collaborators);
    } catch (err) {
      // 被指定看数据的用户没有协作者查看权，静默即可
      if (canManage) showToast(asApiError(err).error, 'error');
    }
    // 链接列表独立加载：被指定查看观看数据的用户（无创建权）也能拿到自己被指定的链接
    if (supportsLinks) {
      try {
        const linksRes = await api.get<{ list: ShareLink[] }>('/share', {
          params: { resourceType, resourceId },
        });
        setLinks(linksRes.data.list);
      } catch {
        setLinks([]);
      }
    }
    setLoading(false);
  }, [canManage, resourceId, resourceType, showToast, supportsLinks]);

  useEffect(() => {
    if (open) void loadAll();
  }, [open, loadAll]);

  const addCollaborator = async (user: UserSearchItem) => {
    try {
      const path = collaboratorBase(resourceType, resourceId);
      const { data } = await api.post<{ collaborator: Collaborator }>(path, {
        userId: user.id,
        role: 'VIEWER',
      });
      setCollaborators((arr) => [...arr.filter((c) => c.user.id !== user.id), data.collaborator]);
      showToast('已添加协作者', 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const updateRole = async (userId: string, role: 'VIEWER' | 'EDITOR') => {
    try {
      const path = `${collaboratorBase(resourceType, resourceId)}/${userId}`;
      const { data } = await api.patch<{ collaborator: Collaborator }>(path, { role });
      setCollaborators((arr) => arr.map((c) => (c.user.id === userId ? data.collaborator : c)));
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const removeCollaborator = async (userId: string) => {
    const ok = await confirmDialog({
      title: '移除协作者',
      message: '移除该协作者？',
      confirmText: '移除',
      danger: true,
    });
    if (!ok) return;
    try {
      const path = `${collaboratorBase(resourceType, resourceId)}/${userId}`;
      await api.delete(path);
      setCollaborators((arr) => arr.filter((c) => c.user.id !== userId));
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const comboExists = links.some(
    (l) =>
      l.role === linkRole &&
      l.trackViews === linkTrack &&
      (!l.expiresAt || new Date(l.expiresAt) > new Date()),
  );

  const createLink = async () => {
    try {
      const { data } = await api.post<{ link: ShareLink }>('/share', {
        resourceType,
        resourceId,
        role: linkRole,
        trackViews: linkTrack,
      });
      setLinks((arr) => [data.link, ...arr]);
      showToast('已生成新链接', 'success');
    } catch (err) {
      const e = asApiError(err);
      if (e.code === 'DUPLICATE_LINK') {
        setHighlightCombo(`${linkRole}|${linkTrack}`);
        window.setTimeout(() => setHighlightCombo(null), 2600);
        showToast('同类型链接已存在，已在下方标出', 'error');
      } else {
        showToast(e.error, 'error');
      }
    }
  };

  const revokeLink = async (id: string) => {
    const ok = await confirmDialog({
      title: '撤销分享链接',
      message: '撤销该分享链接？已生成的链接将立即失效。',
      confirmText: '撤销',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/share/${id}`);
      setLinks((arr) => arr.filter((l) => l.id !== id));
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    // 复制时带上标题：粘贴到聊天里对方一眼能看出是什么文档。
    // 富文本目标（文档/邮件）呈现为以标题为文字的链接；纯文本目标是「标题 + 链接」两行。
    const displayTitle = resourceTitle?.trim() || `${RESOURCE_LABEL[resourceType]}分享`;
    const plainText = `${displayTitle}\n${url}`;
    const escapedTitle = displayTitle
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const htmlText = `<a href="${url}">${escapedTitle}</a>`;
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([plainText], { type: 'text/plain' }),
            'text/html': new Blob([htmlText], { type: 'text/html' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plainText);
      }
      showToast('链接已复制', 'success');
    } catch {
      try {
        await navigator.clipboard.writeText(plainText);
        showToast('链接已复制', 'success');
      } catch {
        await alertDialog({
          title: '请手动复制链接',
          message: plainText,
          mono: true,
        });
      }
    }
  };

  const excludeIds = [owner?.id, ...collaborators.map((c) => c.user.id)].filter(Boolean) as string[];

  return (
    <Modal open={open} onClose={onClose} title={`分享与协作（${RESOURCE_LABEL[resourceType]}）`} size="lg">
      {loading && <div className="text-sm text-text-secondary">加载中…</div>}
      {owner && (
        <section className="mb-6">
          <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">所有者</div>
          <div className="flex items-center gap-3 p-3 rounded-xl border border-black/5 bg-black/[0.02]">
            <Avatar user={owner} size={36} />
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-primary">{owner.name}</div>
              <div className="text-xs text-text-secondary truncate">{owner.email}</div>
            </div>
          </div>
        </section>
      )}

      <section className="mb-6">
        <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
          协作者
        </div>
        {canManage && (
          <div className="mb-3">
            <UserPicker excludeIds={excludeIds} onPick={addCollaborator} />
          </div>
        )}
        {collaborators.length === 0 ? (
          <div className="text-xs text-text-secondary py-2">还没有协作者</div>
        ) : (
          <ul className="space-y-2">
            {collaborators.map((c) => (
              <li key={c.id} className="flex items-center gap-3 p-2 rounded-xl border border-black/5">
                <Avatar user={c.user} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text-primary truncate">{c.user.name}</div>
                  <div className="text-xs text-text-secondary truncate">{c.user.email}</div>
                </div>
                {canManage ? (
                  <>
                    <select
                      value={c.role}
                      onChange={(e) => updateRole(c.user.id, e.target.value as 'VIEWER' | 'EDITOR')}
                      className="h-8 px-2 text-xs rounded-md border border-black/10 bg-white"
                    >
                      <option value="VIEWER">可查看</option>
                      <option value="EDITOR">可编辑</option>
                    </select>
                    <button
                      onClick={() => removeCollaborator(c.user.id)}
                      className="p-1.5 text-text-secondary hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-text-secondary">
                    {c.role === 'EDITOR' ? '可编辑' : '可查看'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {supportsLinks && (canShare || links.length > 0) && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              链接分享
            </div>
            {canShare && (
            <div className="flex items-center gap-2">
              <select
                value={linkRole}
                onChange={(e) => setLinkRole(e.target.value as 'view' | 'edit')}
                className="h-8 px-2 text-xs rounded-md border border-black/10 bg-white"
              >
                <option value="view">仅查看</option>
                <option value="edit">可编辑</option>
              </select>
              <button
                onClick={createLink}
                disabled={comboExists}
                className="flex items-center gap-1 px-3 h-8 rounded-md bg-liquid-indigo text-white text-xs hover:bg-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Link2 size={12} /> 生成链接
              </button>
            </div>
            )}
          </div>
          {canShare && (
          <label className="flex items-center gap-2 mb-2 text-xs text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={linkTrack}
              onChange={(e) => setLinkTrack(e.target.checked)}
              className="accent-liquid-indigo"
            />
            记录观看情况（开启后需登录才能打开，并记录每位观看者的停留、滚动与阅读情况）
          </label>
          <div className={`text-[11px] mb-2 ${comboExists ? 'text-danger' : 'text-text-secondary'}`}>
            {comboExists
              ? '该组合的链接已存在（见下方列表），如需更换请先撤销旧链接。'
              : `将创建：${linkRole === 'edit' ? '可编辑' : '仅查看'}${linkTrack ? ' · 记录观看' : ''}链接（每份资源最多 4 条：查看/编辑 × 记录/不记录）`}
          </div>
          )}
          {links.length === 0 ? (
            <div className="text-xs text-text-secondary py-2">还没有分享链接</div>
          ) : (
            <ul className="space-y-2">
              {links.map((l) => {
                const url = `${window.location.origin}/share/${l.token}`;
                const expired = l.expiresAt ? new Date(l.expiresAt) < new Date() : false;
                const canManageLink = canManage || me?.role === 'ADMIN' || l.createdBy?.id === me?.id;
                return (
                  <li
                    key={l.id}
                    className={`flex items-center gap-2 p-2 rounded-xl border ${
                      highlightCombo === `${l.role}|${l.trackViews}`
                        ? 'border-liquid-indigo/40 ring-2 ring-liquid-indigo/40'
                        : 'border-black/5'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono text-text-primary truncate">{canManageLink ? url : '••••••••••••••••'}</div>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                            l.role === 'edit'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-black/5 text-text-secondary'
                          }`}
                        >
                          {l.role === 'edit' ? '可编辑' : '仅查看'}
                        </span>
                        {l.trackViews && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-liquid-indigo/10 text-liquid-indigo">
                            <Eye size={10} /> 记录观看
                          </span>
                        )}
                        {l.requireLogin && !l.trackViews && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700">
                            需登录
                          </span>
                        )}
                        {expired && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-danger">
                            已过期
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-text-secondary">
                        {l.createdBy ? `${l.createdBy.name} · ` : ''}创建于{' '}
                        {new Date(l.createdAt).toLocaleString()}
                      </div>
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
                    {canManageLink && (
                    <button
                      onClick={() => copyLink(l.token)}
                      className="p-1.5 text-text-secondary hover:text-liquid-indigo"
                      title="复制"
                    >
                      <Copy size={14} />
                    </button>
                    )}
                    {canManageLink && (
                      <button
                        onClick={() => revokeLink(l.id)}
                        className="p-1.5 text-text-secondary hover:text-red-500"
                        title="撤销"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
      {viewsLink && <ShareViewsModal link={viewsLink} onClose={() => setViewsLink(null)} />}
    </Modal>
  );
}
