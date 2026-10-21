import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api, asApiError, uploadFile } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import { useUiStore } from '../../store/ui';
import { SettingsLayout, Field } from './SettingsLayout';
import { FileDrop } from '../../components/FileDrop';
import type { CurrentUser, UserAvatar } from '../../lib/types';

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const showToast = useUiStore((s) => s.showToast);
  const confirmDialog = useUiStore((s) => s.confirmDialog);

  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [history, setHistory] = useState<UserAvatar[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadAvatars = useCallback(async () => {
    try {
      const { data } = await api.get<{ list: UserAvatar[] }>('/me/avatars');
      setHistory(data.list);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setAvatarUrl(user.avatarUrl ?? '');
    }
  }, [user]);

  useEffect(() => {
    void loadAvatars();
  }, [loadAvatars]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.patch<{ user: CurrentUser }>('/me', {
        name,
        avatarUrl: avatarUrl || null,
      });
      setUser(data.user);
      showToast('已保存', 'success');
      await loadAvatars();
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      setSaving(false);
    }
  };

  const upload = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setUploading(true);
    try {
      const data = await uploadFile<{ user: CurrentUser; avatar: UserAvatar }>(
        '/me/avatar/upload',
        file,
      );
      setUser(data.user);
      setAvatarUrl(data.user.avatarUrl ?? '');
      showToast('头像已更新', 'success');
      await loadAvatars();
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      setUploading(false);
    }
  };

  const pick = async (url: string) => {
    try {
      const { data } = await api.post<{ user: CurrentUser }>('/me/avatar/select', { url });
      setUser(data.user);
      setAvatarUrl(data.user.avatarUrl ?? '');
      showToast('已切换头像', 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const removeAvatar = async (id: string) => {
    const ok = await confirmDialog({
      title: '删除头像',
      message: '删除该历史头像？',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/me/avatars/${id}`);
      setHistory((arr) => arr.filter((a) => a.id !== id));
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  if (!user) return null;

  return (
    <SettingsLayout title="个人资料" subtitle="他人会看到这些内容">
      <form onSubmit={save}>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-liquid-indigo/10 text-liquid-indigo flex items-center justify-center overflow-hidden border border-liquid-indigo/20">
            {avatarUrl ? (
              <img src={avatarUrl} className="w-full h-full object-cover" alt={name} />
            ) : (
              <span className="text-2xl font-serif">{name?.[0] ?? '简'}</span>
            )}
          </div>
          <div className="text-sm text-text-secondary">
            <div>{user.email}</div>
            <div className="text-xs">
              {user.role === 'ADMIN' ? '管理员' : '普通用户'} · 最近登录{' '}
              {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '—'}
            </div>
          </div>
        </div>

        <Field label="昵称">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={40}
            className="w-full sm:w-72 px-3 py-2 rounded-xl border border-black/10 bg-white/80 text-sm outline-none focus:border-liquid-indigo focus:ring-2 focus:ring-liquid-indigo/15"
          />
        </Field>

        <Field label="上传本地头像" hint="支持 PNG / JPG / WebP / GIF，最大 5MB">
          <FileDrop
            accept="image/*"
            hint="拖入图片或点击选择"
            busy={uploading}
            onFiles={upload}
            className="max-w-md"
          />
        </Field>

        <Field label="或填写图片链接" hint="留空使用默认头像；上传后会自动同步至此字段">
          <input
            type="text"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://... 或 /api/attachments/.../raw"
            className="w-full sm:w-96 px-3 py-2 rounded-xl border border-black/10 bg-white/80 text-sm outline-none focus:border-liquid-indigo focus:ring-2 focus:ring-liquid-indigo/15"
          />
        </Field>

        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-liquid-indigo text-white text-sm font-medium hover:bg-primary transition-colors disabled:opacity-60"
        >
          {saving ? '保存中…' : '保存修改'}
        </button>
      </form>

      {history.length > 0 && (
        <div className="mt-10 pt-6 border-t border-black/5">
          <div className="text-sm font-semibold text-text-primary mb-3">历史头像</div>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
            {history.map((a) => (
              <div
                key={a.id}
                className={`relative group border rounded-xl overflow-hidden ${
                  avatarUrl === a.url ? 'border-liquid-indigo ring-2 ring-liquid-indigo/30' : 'border-black/10'
                }`}
              >
                <button onClick={() => pick(a.url)} className="block w-full aspect-square">
                  <img src={a.url} alt="历史头像" className="w-full h-full object-cover" />
                </button>
                <button
                  onClick={() => removeAvatar(a.id)}
                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 max-md:opacity-100 bg-white/90 rounded-md p-1 text-text-secondary hover:text-red-500 shadow-sm"
                  title="删除"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </SettingsLayout>
  );
}
