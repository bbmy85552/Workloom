import { useCallback, useEffect, useState } from 'react';
import { Copy, Link2, Trash2 } from 'lucide-react';
import { api, asApiError } from '../lib/api';
import { useUiStore } from '../store/ui';
import { Modal } from './Modal';
import { Avatar, UserPicker } from './UserPicker';
import type { Collaborator, ShareLink, UserSearchItem } from '../lib/types';

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  resourceType: 'doc' | 'table' | 'memory';
  resourceId: string;
  canManage: boolean;
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

export function ShareDialog({ open, onClose, resourceType, resourceId, canManage }: ShareDialogProps) {
  // 项目记忆只支持协作者，不支持公开分享链接
  const supportsLinks = resourceType !== 'memory';
  const showToast = useUiStore((s) => s.showToast);
  const confirmDialog = useUiStore((s) => s.confirmDialog);
  const alertDialog = useUiStore((s) => s.alertDialog);
  const [owner, setOwner] = useState<UserSearchItem | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkRole, setLinkRole] = useState<'view' | 'edit'>('view');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const collabPath = collaboratorBase(resourceType, resourceId);
      const [collabRes, linksRes] = await Promise.all([
        api.get<{ owner: UserSearchItem; collaborators: Collaborator[] }>(collabPath),
        canManage && supportsLinks
          ? api.get<{ list: ShareLink[] }>('/share', { params: { resourceType, resourceId } })
          : Promise.resolve({ data: { list: [] } }),
      ]);
      setOwner(collabRes.data.owner);
      setCollaborators(collabRes.data.collaborators);
      setLinks(linksRes.data.list);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      setLoading(false);
    }
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

  const createLink = async () => {
    try {
      const { data } = await api.post<{ link: ShareLink }>('/share', {
        resourceType,
        resourceId,
        role: linkRole,
      });
      setLinks((arr) => [data.link, ...arr]);
      showToast('已生成新链接', 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
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
    try {
      await navigator.clipboard.writeText(url);
      showToast('链接已复制', 'success');
    } catch {
      await alertDialog({
        title: '请手动复制链接',
        message: url,
        mono: true,
      });
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

      {canManage && supportsLinks && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              链接分享
            </div>
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
                className="flex items-center gap-1 px-3 h-8 rounded-md bg-liquid-indigo text-white text-xs hover:bg-primary"
              >
                <Link2 size={12} /> 生成链接
              </button>
            </div>
          </div>
          {links.length === 0 ? (
            <div className="text-xs text-text-secondary py-2">还没有分享链接</div>
          ) : (
            <ul className="space-y-2">
              {links.map((l) => {
                const url = `${window.location.origin}/share/${l.token}`;
                return (
                  <li key={l.id} className="flex items-center gap-2 p-2 rounded-xl border border-black/5">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono text-text-primary truncate">{url}</div>
                      <div className="text-[11px] text-text-secondary">
                        {l.role === 'edit' ? '可编辑' : '仅查看'} · 创建于{' '}
                        {new Date(l.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={() => copyLink(l.token)}
                      className="p-1.5 text-text-secondary hover:text-liquid-indigo"
                      title="复制"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={() => revokeLink(l.id)}
                      className="p-1.5 text-text-secondary hover:text-red-500"
                      title="撤销"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </Modal>
  );
}
