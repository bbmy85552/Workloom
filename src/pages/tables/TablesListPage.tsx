import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Table as TableIcon, Sparkles, Trash2, Pencil, Upload } from 'lucide-react';
import { api, asApiError, uploadFile } from '../../lib/api';
import { useUiStore } from '../../store/ui';
import type { TableBase, TableTemplate, Workspace } from '../../lib/types';

export function TablesListPage() {
  const [list, setList] = useState<TableBase[]>([]);
  const [templates, setTemplates] = useState<TableTemplate[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const showToast = useUiStore((s) => s.showToast);
  const confirmDialog = useUiStore((s) => s.confirmDialog);
  const promptDialog = useUiStore((s) => s.promptDialog);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [w, t, l] = await Promise.all([
        api.get<{ list: Workspace[] }>('/workspaces'),
        api.get<{ templates: TableTemplate[] }>('/tables/templates'),
        api.get<{ list: TableBase[] }>('/tables'),
      ]);
      setWorkspaces(w.data.list);
      setTemplates(t.data.templates);
      setList(l.data.list);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const createFromTemplate = async (key: string | null, name: string) => {
    if (workspaces.length === 0) return;
    try {
      const body: Record<string, unknown> = {
        workspaceId: workspaces[0].id,
        name,
      };
      if (key) body.templateKey = key;
      const { data } = await api.post<{ table: TableBase }>('/tables', body);
      navigate(`/app/tables/${data.table.id}`);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const rename = async (tb: TableBase) => {
    const t = await promptDialog({
      title: '重命名数据表',
      message: '请输入新的数据表名称：',
      defaultValue: tb.name,
      confirmText: '保存',
    });
    if (t === null) return;
    const name = t.trim();
    if (!name || name === tb.name) return;
    try {
      await api.patch(`/tables/${tb.id}`, { name });
      setList((arr) => arr.map((x) => (x.id === tb.id ? { ...x, name } : x)));
      showToast('已重命名', 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const importCsv = async (file: File) => {
    if (workspaces.length === 0) return;
    try {
      const data = await uploadFile<{ table: TableBase }>('/tables/import-csv', file, {
        workspaceId: workspaces[0].id,
      });
      showToast(`已从 CSV 导入：${data.table.name}`, 'success');
      navigate(`/app/tables/${data.table.id}`);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const remove = async (tb: TableBase) => {
    const ok = await confirmDialog({
      title: '删除数据表',
      message: `确认删除数据表「${tb.name}」？此操作不可恢复。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/tables/${tb.id}`);
      setList((arr) => arr.filter((x) => x.id !== tb.id));
      showToast('已删除', 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  return (
    <div className="py-6 sm:py-8 animate-fade-in-up">
      <header className="mb-8">
        <h1 className="text-3xl sm:text-[36px] font-serif font-bold text-text-primary mb-2">
          数据表
        </h1>
        <p className="text-text-secondary">用结构化的方式管理任务、客户、Bug 与日常记录。</p>
      </header>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">我的数据表</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => csvInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-black/10 text-sm text-text-secondary hover:bg-black/5"
          >
            <Upload size={14} /> 导入 CSV
          </button>
          <button
            onClick={() => setCreating((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-liquid-indigo text-white text-sm font-medium hover:bg-primary transition-colors"
          >
            <Plus size={14} /> 新建数据表
          </button>
        </div>
      </div>

      <input
        ref={csvInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importCsv(file);
          e.target.value = '';
        }}
      />

      {creating && (
        <div className="glass-card rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-2 mb-4 text-sm font-medium text-text-primary">
            <Sparkles size={16} className="text-liquid-indigo" />
            选择模板创建
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
            <li>
              <button
                onClick={() => createFromTemplate(null, '空白数据表')}
                className="w-full text-left p-4 rounded-xl border border-dashed border-black/10 hover:border-liquid-indigo hover:bg-liquid-indigo/5 transition-colors"
              >
                <div className="font-semibold text-sm text-text-primary">空白数据表</div>
                <div className="text-xs text-text-secondary mt-1">从零开始，自行设计字段</div>
              </button>
            </li>
            {templates.map((tpl) => (
              <li key={tpl.key}>
                <button
                  onClick={() => createFromTemplate(tpl.key, tpl.name)}
                  className="w-full text-left p-4 rounded-xl border border-black/10 bg-white/80 hover:border-liquid-indigo hover:bg-liquid-indigo/5 transition-colors"
                >
                  <div className="font-semibold text-sm text-text-primary">{tpl.name}</div>
                  <div className="text-xs text-text-secondary mt-1 line-clamp-2">
                    {tpl.description}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {list.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center">
          <div className="text-text-secondary text-sm">还没有数据表，点击右上角从模板创建一个吧。</div>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map((tb) => (
            <li key={tb.id} className="relative group">
              <button
                onClick={() => navigate(`/app/tables/${tb.id}`)}
                className="glass-card rounded-xl p-4 w-full text-left flex items-start gap-3 hover:shadow-md transition-all hover:-translate-y-0.5"
              >
                <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                  <TableIcon size={18} />
                </div>
                <div className="min-w-0 flex-1 pr-12">
                  <div className="text-sm font-semibold text-text-primary truncate">{tb.name}</div>
                  <div className="text-xs text-text-secondary mt-1">
                    更新于 {new Date(tb.updatedAt).toLocaleString()}
                  </div>
                </div>
              </button>
              {tb.canManage !== false && (
              <div className="absolute top-2 right-2 hidden group-hover:flex max-md:flex gap-0.5 bg-white/90 backdrop-blur rounded-lg border border-black/5 shadow-sm">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    rename(tb);
                  }}
                  className="p-1.5 text-text-secondary hover:text-liquid-indigo hover:bg-liquid-indigo/5 rounded-md"
                  title="重命名"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(tb);
                  }}
                  className="p-1.5 text-text-secondary hover:text-red-500 hover:bg-red-50 rounded-md"
                  title="删除"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
