import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Brain, Globe, Lock, Plus, Search, Users } from 'lucide-react';
import { api, asApiError } from '../../lib/api';
import { useUiStore } from '../../store/ui';
import { Modal } from '../../components/Modal';
import { ROLE_LABEL, type MemoryProject, type MemoryScope } from './types';

const TABS = [
  { v: 'mine', label: '我的项目', icon: Lock },
  { v: 'public', label: '公共项目', icon: Globe },
  { v: 'shared', label: '共享给我', icon: Users },
] as const;

export function MemoryListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') as MemoryScope | null;
  const [tab, setTab] = useState<MemoryScope>(
    initialTab && ['mine', 'public', 'shared'].includes(initialTab) ? initialTab : 'mine',
  );
  const [q, setQ] = useState('');
  const [list, setList] = useState<MemoryProject[]>([]);
  const [counts, setCounts] = useState<Record<MemoryScope, number>>({ mine: 0, public: 0, shared: 0 });
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', kind: 'PRIVATE' as 'PRIVATE' | 'PUBLIC' });
  const [saving, setSaving] = useState(false);
  const showToast = useUiStore((s) => s.showToast);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ list: MemoryProject[]; counts: Record<MemoryScope, number> }>(
        '/memory/projects',
        { params: { tab, q: q.trim() || undefined } },
      );
      setList(data.list);
      setCounts(data.counts);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      setLoading(false);
    }
  }, [q, showToast, tab]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const switchTab = (v: MemoryScope) => {
    setTab(v);
    setSearchParams(v === 'mine' ? {} : { tab: v }, { replace: true });
  };

  const openCreate = () => {
    setForm({ name: '', description: '', kind: tab === 'public' ? 'PUBLIC' : 'PRIVATE' });
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    const name = form.name.trim();
    if (!name) {
      showToast('请输入项目名称', 'error');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post<{ project: MemoryProject }>('/memory/projects', {
        name,
        description: form.description.trim() || null,
        workspaceKind: form.kind,
      });
      setCreateOpen(false);
      showToast('项目已创建', 'success');
      navigate(`/app/memory/${data.project.id}`);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="py-6 sm:py-8 animate-fade-in-up">
      <header className="mb-8">
        <h1 className="text-3xl sm:text-[36px] font-serif font-bold text-text-primary mb-2">项目记忆</h1>
        <p className="text-text-secondary">
          为每个项目沉淀事实、决策与偏好，供 Claude、ChatGPT、Cursor 等 AI 工具通过 MCP 读取和写入。
        </p>
      </header>

      <section className="glass-card rounded-2xl p-5 sm:p-6 mb-6">
        <h2 className="text-base font-semibold text-text-primary mb-2">什么是项目记忆？</h2>
        <p className="text-sm text-text-secondary leading-relaxed">
          项目记忆是每个项目的长期笔记本：项目背景、关键事实、技术决策和团队偏好都沉淀在这里，人和 AI 随时查阅，不用每次重新交代背景。
        </p>
        <p className="text-sm text-text-secondary leading-relaxed mt-2">
          AI 工具（Claude、Cursor、Claude Code 等）可通过 MCP 直接读写这些记忆：开始工作前先读取掌握上下文，得出新决策时顺手记录，下次无缝衔接。
        </p>
        <p className="text-sm text-text-secondary leading-relaxed mt-2">
          适合记录：事实（背景与现状）、决策（定了什么以及为什么）、偏好（团队约定与禁忌）、笔记（日常记录）、待办（尚未完成的事）。可见范围上，私人项目仅自己与受邀协作者可见，公共项目团队所有登录用户可查看，也可以把某个项目单独共享给指定同事。
        </p>
      </section>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-1 bg-black/5 rounded-xl p-1 w-fit text-sm">
          {TABS.map((t) => (
            <button
              key={t.v}
              onClick={() => switchTab(t.v)}
              className={`px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-colors ${
                tab === t.v ? 'bg-white shadow-sm text-text-primary' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <t.icon size={14} /> {t.label}
              <span className="text-xs text-text-secondary">{counts[t.v]}</span>
            </button>
          ))}
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-liquid-indigo text-white text-sm font-medium hover:bg-primary transition-colors w-fit"
        >
          <Plus size={14} /> 新建项目
        </button>
      </div>

      <div className="relative max-w-md mb-6">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索项目名称或简介…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-black/10 bg-white/80 text-sm outline-none focus:border-liquid-indigo focus:ring-2 focus:ring-liquid-indigo/15"
        />
      </div>

      {loading && list.length === 0 ? (
        <div className="text-sm text-text-secondary">加载中…</div>
      ) : list.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center">
          <div className="text-text-secondary text-sm">
            {tab === 'shared'
              ? '还没有人把项目共享给你。'
              : tab === 'public'
                ? '还没有公共项目，新建一个团队共享的项目记忆吧。'
                : '还没有项目，点击「新建项目」开始记录。'}
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => navigate(`/app/memory/${p.id}`)}
                className="glass-card rounded-xl p-4 w-full h-full text-left flex items-start gap-3 hover:shadow-md transition-all hover:-translate-y-0.5"
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    p.workspace.kind === 'PUBLIC' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'
                  }`}
                >
                  <Brain size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-text-primary truncate">{p.name}</div>
                    {p.workspace.kind === 'PUBLIC' ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 shrink-0">公共</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 text-text-secondary shrink-0">私人</span>
                    )}
                  </div>
                  {p.description && (
                    <div className="text-xs text-text-secondary mt-1 line-clamp-2">{p.description}</div>
                  )}
                  <div className="text-xs text-text-secondary mt-2 flex flex-wrap gap-x-2">
                    <span>{p.itemCount ?? 0} 条记忆</span>
                    {p.access && <span>· {ROLE_LABEL[p.access.role]}</span>}
                    {p.createdBy && p.scope !== 'mine' && <span>· {p.createdBy.name}</span>}
                    <span>· {new Date(p.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="新建项目记忆">
        <div className="space-y-4">
          <label className="block">
            <div className="text-xs font-medium text-text-secondary mb-1.5">项目名称</div>
            <input
              autoFocus
              value={form.name}
              maxLength={80}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) void submitCreate();
              }}
              placeholder="例如：官网改版、jianji 开发"
              className="w-full px-3 py-2 rounded-xl border border-black/10 bg-white text-sm outline-none focus:border-liquid-indigo focus:ring-2 focus:ring-liquid-indigo/15"
            />
          </label>
          <label className="block">
            <div className="text-xs font-medium text-text-secondary mb-1.5">简介（可选）</div>
            <textarea
              value={form.description}
              rows={3}
              maxLength={2000}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="项目背景、目标，AI 读取记忆时会一并看到"
              className="w-full px-3 py-2 rounded-xl border border-black/10 bg-white text-sm outline-none focus:border-liquid-indigo focus:ring-2 focus:ring-liquid-indigo/15"
            />
          </label>
          <div>
            <div className="text-xs font-medium text-text-secondary mb-1.5">可见范围</div>
            <div className="grid grid-cols-2 gap-2">
              {([
                { v: 'PRIVATE', label: '私人', desc: '仅自己和邀请的协作者', icon: Lock },
                { v: 'PUBLIC', label: '公共', desc: '团队所有登录用户可查看', icon: Globe },
              ] as const).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, kind: o.v }))}
                  className={`text-left p-3 rounded-xl border transition-colors ${
                    form.kind === o.v
                      ? 'border-liquid-indigo bg-liquid-indigo/5'
                      : 'border-black/10 hover:border-black/20'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
                    <o.icon size={14} /> {o.label}
                  </div>
                  <div className="text-xs text-text-secondary mt-1">{o.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setCreateOpen(false)}
              className="px-4 py-2 rounded-xl border border-black/10 text-sm text-text-secondary hover:bg-black/5"
            >
              取消
            </button>
            <button
              disabled={saving}
              onClick={submitCreate}
              className="px-4 py-2 rounded-xl bg-liquid-indigo text-white text-sm font-medium hover:bg-primary disabled:opacity-60"
            >
              创建
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
