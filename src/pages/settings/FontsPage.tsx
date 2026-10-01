import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api, asApiError } from '../../lib/api';
import { useUiStore } from '../../store/ui';
import { SettingsLayout, Field } from './SettingsLayout';

interface BuiltinFont {
  family: string;
  license: string;
  licenseUrl: string;
  usage: string;
}

interface UserFont {
  id: string;
  family: string;
  source: string;
  createdAt: string;
}

export function FontsPage() {
  const [builtin, setBuiltin] = useState<BuiltinFont[]>([]);
  const [list, setList] = useState<UserFont[]>([]);
  const [family, setFamily] = useState('');
  const [source, setSource] = useState('');
  const [ack, setAck] = useState(false);
  const [saving, setSaving] = useState(false);
  const showToast = useUiStore((s) => s.showToast);
  const confirmDialog = useUiStore((s) => s.confirmDialog);

  const load = useCallback(async () => {
    try {
      const [b, l] = await Promise.all([
        api.get<{ list: BuiltinFont[] }>('/fonts/builtin'),
        api.get<{ list: UserFont[] }>('/fonts'),
      ]);
      setBuiltin(b.data.list);
      setList(l.data.list);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ack) return showToast('请勾选授权确认', 'error');
    setSaving(true);
    try {
      await api.post('/fonts', { family, source, licenseAck: true });
      setFamily('');
      setSource('');
      setAck(false);
      void load();
      showToast('已添加字体记录', 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const ok = await confirmDialog({
      title: '删除字体',
      message: '删除该字体？',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/fonts/${id}`);
      void load();
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  return (
    <SettingsLayout title="字体管理" subtitle="管理内置字体许可证和你导入的字体">
      <div className="mb-8">
        <div className="text-sm font-semibold text-text-primary mb-3">内置字体（开源）</div>
        <ul className="space-y-2">
          {builtin.map((f) => (
            <li key={f.family} className="flex items-center justify-between bg-surface-container-lowest border border-black/10 rounded-xl px-4 py-3">
              <div>
                <div className="text-sm font-medium text-text-primary" style={{ fontFamily: f.family }}>
                  {f.family}
                </div>
                <div className="text-xs text-text-secondary mt-0.5">
                  {f.usage} · 许可证：{f.license}
                </div>
              </div>
              <a
                href={f.licenseUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-liquid-indigo hover:underline"
              >
                查看许可
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-8">
        <div className="text-sm font-semibold text-text-primary mb-3">我导入的字体</div>
        {list.length === 0 ? (
          <div className="bg-surface-container-lowest border border-dashed border-black/10 rounded-xl p-6 text-sm text-text-secondary text-center">
            还没有导入字体。导入仅会记录字体名与来源，不会上传字体文件。
          </div>
        ) : (
          <ul className="space-y-2">
            {list.map((f) => (
              <li key={f.id} className="flex items-center justify-between bg-surface-container-lowest border border-black/10 rounded-xl px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-text-primary" style={{ fontFamily: f.family }}>
                    {f.family}
                  </div>
                  <div className="text-xs text-text-secondary mt-0.5">{f.source}</div>
                </div>
                <button
                  onClick={() => remove(f.id)}
                  className="p-2 text-text-secondary hover:text-red-500 hover:bg-black/5 rounded-lg transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={submit} className="border-t border-black/5 pt-6">
        <div className="text-sm font-semibold text-text-primary mb-3">导入新字体</div>
        <Field label="字体家族名 (font-family)" hint="例如 Inter, Noto Sans SC">
          <input
            value={family}
            onChange={(e) => setFamily(e.target.value)}
            required
            maxLength={60}
            className="w-full sm:w-72 px-3 py-2 rounded-xl border border-black/10 bg-white/80 text-sm outline-none focus:border-liquid-indigo focus:ring-2 focus:ring-liquid-indigo/15"
          />
        </Field>
        <Field label="字体来源" hint="官网链接、字体文件 URL 或开源仓库地址">
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            required
            maxLength={500}
            placeholder="https://..."
            className="w-full sm:w-96 px-3 py-2 rounded-xl border border-black/10 bg-white/80 text-sm outline-none focus:border-liquid-indigo focus:ring-2 focus:ring-liquid-indigo/15"
          />
        </Field>
        <label className="flex items-start gap-2 text-xs text-text-secondary mb-4">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
          我已确认拥有该字体在当前使用场景下的合法授权，且不会与当前部署的使用要求冲突。
        </label>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-liquid-indigo text-white text-sm font-medium hover:bg-primary transition-colors disabled:opacity-60"
        >
          {saving ? '提交中…' : '添加字体'}
        </button>
      </form>
    </SettingsLayout>
  );
}
