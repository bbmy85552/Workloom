import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  Plus,
  Trash2,
  Columns,
  LayoutList,
  Calendar,
  Pencil,
  Users,
  Paperclip,
  Upload,
  Download,
  ClipboardList,
  Copy,
  GanttChartSquare,
  Sparkles,
} from 'lucide-react';
import { api, asApiError, downloadFromApi, uploadFile } from '../../lib/api';
import { useUiStore } from '../../store/ui';
import { useAuthStore } from '../../store/auth';
import { ShareDialog } from '../../components/ShareDialog';
import { PresenceIndicator } from '../../components/PresenceIndicator';
import { Modal } from '../../components/Modal';
import { GanttView } from '../../components/tables/GanttView';
import { displayFilename } from '../../lib/filename';
import { evalFormula, formatFormulaValue } from '../../lib/formula';
import type {
  Attachment,
  TableBase,
  TableField,
  TableFormView,
  TableRecord,
} from '../../lib/types';

const TYPE_OPTIONS = [
  { value: 'text', label: '文本' },
  { value: 'longtext', label: '长文本' },
  { value: 'number', label: '数字' },
  { value: 'date', label: '日期' },
  { value: 'datetime', label: '日期时间' },
  { value: 'select', label: '单选' },
  { value: 'multiselect', label: '多选' },
  { value: 'checkbox', label: '复选' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: '邮箱' },
  { value: 'phone', label: '电话' },
  { value: 'rating', label: '评分' },
  { value: 'progress', label: '进度' },
  { value: 'user', label: '人员' },
  { value: 'attachment', label: '附件' },
  { value: 'formula', label: '公式（计算字段）' },
];

type ViewKind = 'table' | 'kanban' | 'calendar' | 'gantt';

export function TableDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const showToast = useUiStore((s) => s.showToast);
  const confirmDialog = useUiStore((s) => s.confirmDialog);
  const promptDialog = useUiStore((s) => s.promptDialog);

  const me = useAuthStore((s) => s.user);
  const [table, setTable] = useState<TableBase | null>(null);
  const [role, setRole] = useState<'OWNER' | 'EDITOR' | 'VIEWER'>('OWNER');
  const [fields, setFields] = useState<TableField[]>([]);
  const [records, setRecords] = useState<TableRecord[]>([]);
  const [view, setView] = useState<ViewKind>('table');
  const [autoFitTable, setAutoFitTable] = useState(false);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [filterField, setFilterField] = useState<string | null>(null);
  const [filterValue, setFilterValue] = useState('');
  const [addingField, setAddingField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');
  const [newFieldFormula, setNewFieldFormula] = useState('');
  const [newFieldChoices, setNewFieldChoices] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [formsOpen, setFormsOpen] = useState(false);
  const [formsList, setFormsList] = useState<TableFormView[]>([]);
  const [creatingForm, setCreatingForm] = useState(false);
  const [newFormTitle, setNewFormTitle] = useState('反馈收集');
  const [newFormDesc, setNewFormDesc] = useState('');
  const [newFormFields, setNewFormFields] = useState<Set<string>>(new Set());
  const [newFormRequired, setNewFormRequired] = useState<Set<string>>(new Set());
  const uploadResolverRef = useRef<((att: Attachment | null) => void) | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadBusyRef = useRef(false);
  const canWrite = role === 'OWNER' || role === 'EDITOR';

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await api.get<{
        table: TableBase;
        role: 'OWNER' | 'EDITOR' | 'VIEWER';
        fields: TableField[];
        records: TableRecord[];
      }>(`/tables/${id}`);
      setTable(data.table);
      setRole(data.role);
      setFields(data.fields);
      setRecords(data.records);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
      navigate('/app/tables');
    }
  }, [id, navigate, showToast]);

  const requestUpload = useCallback((): Promise<Attachment | null> => {
    if (uploadBusyRef.current) return Promise.resolve(null);
    return new Promise((resolve) => {
      uploadResolverRef.current = resolve;
      uploadInputRef.current?.click();
    });
  }, []);

  const onUploadFile = async (file: File | undefined) => {
    const resolver = uploadResolverRef.current;
    uploadResolverRef.current = null;
    if (uploadBusyRef.current) {
      resolver?.(null);
      return;
    }
    if (!file || !id) {
      resolver?.(null);
      return;
    }
    uploadBusyRef.current = true;
    try {
      const data = await uploadFile<{ attachment: Attachment }>(
        '/attachments/upload',
        file,
        { tableId: id, category: 'table-file' },
      );
      resolver?.(data.attachment);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
      resolver?.(null);
    } finally {
      uploadBusyRef.current = false;
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  const updateCell = async (recordId: string, field: TableField, value: unknown) => {
    const target = records.find((r) => r.id === recordId);
    if (!target) return;
    const updated = { ...target, data: { ...target.data, [field.name]: value } };
    setRecords(records.map((r) => (r.id === recordId ? updated : r)));
    try {
      await api.patch(`/tables/${id}/records/${recordId}`, { data: updated.data });
    } catch (err) {
      showToast(asApiError(err).error, 'error');
      void load();
    }
  };

  const addRecord = async () => {
    try {
      const { data } = await api.post<{ record: TableRecord }>(`/tables/${id}/records`, {
        data: {},
      });
      setRecords((rs) => [...rs, data.record]);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const duplicateRecord = async (record: TableRecord) => {
    try {
      const { data } = await api.post<{ record: TableRecord }>(`/tables/${id}/records`, {
        data: { ...record.data },
      });
      setRecords((rs) => [...rs, data.record]);
      showToast('已复制记录', 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const removeRecord = async (recordId: string) => {
    try {
      await api.delete(`/tables/${id}/records/${recordId}`);
      setRecords((rs) => rs.filter((r) => r.id !== recordId));
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const addField = async () => {
    const name = newFieldName.trim();
    if (!name) return;
    if (newFieldType === 'formula' && !newFieldFormula.trim()) {
      showToast('请填写公式表达式', 'error');
      return;
    }
    const choices = parseChoices(newFieldChoices);
    if ((newFieldType === 'select' || newFieldType === 'multiselect') && choices.length === 0) {
      showToast('请至少填写一个选项', 'error');
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        name,
        type: newFieldType,
      };
      if (newFieldType === 'formula') {
        payload.options = { formula: newFieldFormula.trim() };
      }
      if (newFieldType === 'select' || newFieldType === 'multiselect') {
        payload.options = { choices };
      }
      const { data } = await api.post<{ field: TableField }>(`/tables/${id}/fields`, payload);
      setFields((fs) => [...fs, data.field]);
      setNewFieldName('');
      setNewFieldFormula('');
      setNewFieldChoices('');
      setNewFieldType('text');
      setAddingField(false);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const removeField = async (fieldId: string) => {
    const ok = await confirmDialog({
      title: '删除字段',
      message: '删除该字段及对应数据？',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/tables/${id}/fields/${fieldId}`);
      setFields((fs) => fs.filter((f) => f.id !== fieldId));
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const visibleRecords = useMemo(() => {
    let arr = records;
    if (filterField && filterValue) {
      const k = filterValue.toLowerCase();
      arr = arr.filter((r) => String(r.data[filterField] ?? '').toLowerCase().includes(k));
    }
    if (sortField) {
      arr = [...arr].sort((a, b) => {
        const av = a.data[sortField] ?? '';
        const bv = b.data[sortField] ?? '';
        if (av === bv) return 0;
        const cmp = String(av).localeCompare(String(bv), 'zh');
        return sortAsc ? cmp : -cmp;
      });
    }
    return arr;
  }, [records, filterField, filterValue, sortField, sortAsc]);

  const stats = useMemo(() => {
    const editableFields = fields.filter((f) => f.type !== 'formula');
    const totalCells = records.length * editableFields.length;
    const filledCells = records.reduce(
      (count, record) =>
        count +
        editableFields.filter((field) => {
          const value = record.data[field.name];
          if (Array.isArray(value)) return value.length > 0;
          return value !== null && value !== undefined && value !== '';
        }).length,
      0,
    );
    const progressFields = fields.filter((f) => f.type === 'progress');
    const progressValues = records.flatMap((record) =>
      progressFields
        .map((field) => Number(record.data[field.name]))
        .filter((value) => Number.isFinite(value)),
    );
    const checkboxFields = fields.filter((f) => f.type === 'checkbox');
    const checkboxTotal = checkboxFields.length * records.length;
    const checkboxDone = records.reduce(
      (count, record) => count + checkboxFields.filter((field) => !!record.data[field.name]).length,
      0,
    );
    return {
      recordCount: records.length,
      fieldCount: fields.length,
      visibleCount: visibleRecords.length,
      fillRate: totalCells ? Math.round((filledCells / totalCells) * 100) : 0,
      avgProgress: progressValues.length
        ? Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length)
        : null,
      checkboxRate: checkboxTotal ? Math.round((checkboxDone / checkboxTotal) * 100) : null,
    };
  }, [fields, records, visibleRecords.length]);

  if (!table) return null;

  return (
    <div className="py-4 sm:py-6 animate-fade-in-up">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate('/app/tables')}
          className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-liquid-indigo"
        >
          <ChevronLeft size={16} /> 返回数据表列表
        </button>
      </div>

      <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl sm:text-[28px] font-serif font-bold text-text-primary truncate">
          {table.name}
        </h1>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {table && me && (
            <PresenceIndicator resourceType="table" resourceId={table.id} selfId={me.id} />
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
          <div className="relative">
            <button
              onClick={() => setExportOpen((v) => !v)}
              onBlur={() => window.setTimeout(() => setExportOpen(false), 200)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-black/10 text-text-secondary hover:bg-black/5"
            >
              <Download size={14} /> 导出
            </button>
            {exportOpen && table && (
              <div className="absolute right-0 mt-1 w-44 bg-white border border-black/5 rounded-lg shadow-lg z-20 py-1 text-sm">
                <button
                  onMouseDown={async () => {
                    try {
                      await downloadFromApi(
                        `/tables/${table.id}/export?format=csv`,
                        `${table.name}.csv`,
                      );
                      showToast('已导出 CSV', 'success');
                    } catch (err) {
                      showToast(asApiError(err).error, 'error');
                    } finally {
                      setExportOpen(false);
                    }
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-black/5"
                >
                  CSV（通用导入）
                </button>
                <button
                  onMouseDown={async () => {
                    try {
                      await downloadFromApi(
                        `/tables/${table.id}/export?format=xlsx`,
                        `${table.name}.xlsx`,
                      );
                      showToast('已导出 XLSX', 'success');
                    } catch (err) {
                      showToast(asApiError(err).error, 'error');
                    } finally {
                      setExportOpen(false);
                    }
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-black/5"
                >
                  Excel (.xlsx)
                </button>
              </div>
            )}
          </div>
          <button
            onClick={async () => {
              setFormsOpen(true);
              try {
                if (!id) return;
                const { data } = await api.get<{ list: TableFormView[] }>(
                  `/forms/by-table/${id}`,
                );
                setFormsList(data.list);
              } catch (err) {
                showToast(asApiError(err).error, 'error');
              }
            }}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-black/10 text-text-secondary hover:bg-black/5"
          >
            <ClipboardList size={14} /> 表单视图
          </button>
          <button
            onClick={() => setShareOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-black/10 text-text-secondary hover:bg-black/5"
          >
            <Users size={14} /> 分享
          </button>
          {canWrite && (
            <button
              onClick={async () => {
                const t = await promptDialog({
                  title: '重命名数据表',
                  message: '请输入新的数据表名称：',
                  defaultValue: table.name,
                  confirmText: '保存',
                });
                if (t === null) return;
                const name = t.trim();
                if (!name || name === table.name) return;
                try {
                  const { data } = await api.patch<{ table: TableBase }>(`/tables/${id}`, { name });
                  setTable(data.table);
                  showToast('已重命名', 'success');
                } catch (err) {
                  showToast(asApiError(err).error, 'error');
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-secondary border border-black/10 rounded-lg hover:bg-black/5"
            >
              <Pencil size={14} /> 重命名
            </button>
          )}
          {role === 'OWNER' && (
            <button
              onClick={async () => {
                const ok = await confirmDialog({
                  title: '删除数据表',
                  message: `确认删除数据表「${table.name}」？此操作不可恢复。`,
                  confirmText: '删除',
                  danger: true,
                });
                if (!ok) return;
                try {
                  await api.delete(`/tables/${id}`);
                  showToast('已删除', 'success');
                  navigate('/app/tables');
                } catch (err) {
                  showToast(asApiError(err).error, 'error');
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-500 border border-red-200 rounded-lg hover:bg-red-50"
            >
              <Trash2 size={14} /> 删除数据表
            </button>
          )}
        </div>
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          void onUploadFile(f);
          e.target.value = '';
        }}
      />
      {table && (
        <ShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          resourceType="table"
          resourceId={table.id}
          canManage={role === 'OWNER'}
        />
      )}

      <Modal
        open={formsOpen}
        title="表单视图"
        onClose={() => {
          setFormsOpen(false);
          setCreatingForm(false);
        }}
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-xs text-text-secondary">
            通过表单视图，你可以把数据表变成可对外收集的问卷。提交后的内容会作为新记录写入表格。
          </p>

          {!creatingForm ? (
            <>
              <button
                onClick={() => {
                  const init = new Set(fields.slice(0, Math.min(4, fields.length)).map((f) => f.name));
                  setNewFormFields(init);
                  setNewFormRequired(new Set());
                  setNewFormTitle('反馈收集');
                  setNewFormDesc('');
                  setCreatingForm(true);
                }}
                className="px-3 py-1.5 rounded-lg bg-liquid-indigo text-white text-sm inline-flex items-center gap-1"
              >
                <Plus size={14} /> 创建新表单
              </button>

              <div className="border-t border-black/5 pt-3">
                {formsList.length === 0 ? (
                  <div className="text-sm text-text-secondary text-center py-6">
                    暂未创建任何表单
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {formsList.map((f) => {
                      const url = `${window.location.origin}/forms/${f.token}`;
                      return (
                        <li
                          key={f.id}
                          className="border border-black/5 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-2"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-text-primary">{f.title}</div>
                            <div className="text-xs text-text-secondary mt-0.5 truncate">
                              {url} · 累计提交 {f.submissions}{' '}
                              {f.closedAt ? '· 已关闭' : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(url);
                                showToast('已复制链接', 'success');
                              }}
                              className="px-2 py-1 text-xs rounded-md border border-black/10 inline-flex items-center gap-1"
                            >
                              <Copy size={12} /> 复制
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  const { data } = await api.patch<{ form: TableFormView }>(
                                    `/forms/${f.id}/close`,
                                  );
                                  setFormsList((arr) =>
                                    arr.map((x) => (x.id === f.id ? data.form : x)),
                                  );
                                } catch (err) {
                                  showToast(asApiError(err).error, 'error');
                                }
                              }}
                              className="px-2 py-1 text-xs rounded-md border border-black/10"
                            >
                              {f.closedAt ? '重新开启' : '关闭收集'}
                            </button>
                            <button
                              onClick={async () => {
                                const ok = await confirmDialog({
                                  title: '删除表单',
                                  message: `删除表单「${f.title}」？`,
                                  confirmText: '删除',
                                  danger: true,
                                });
                                if (!ok) return;
                                try {
                                  await api.delete(`/forms/${f.id}`);
                                  setFormsList((arr) => arr.filter((x) => x.id !== f.id));
                                } catch (err) {
                                  showToast(asApiError(err).error, 'error');
                                }
                              }}
                              className="p-1 text-text-secondary hover:text-red-500"
                              title="删除"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <input
                value={newFormTitle}
                onChange={(e) => setNewFormTitle(e.target.value)}
                placeholder="表单标题"
                className="w-full px-3 py-2 rounded-lg border border-black/10 bg-white text-sm"
              />
              <textarea
                value={newFormDesc}
                onChange={(e) => setNewFormDesc(e.target.value)}
                placeholder="描述（可选）"
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-black/10 bg-white text-sm"
              />
              <div className="text-xs text-text-secondary">勾选需要让访客填写的字段：</div>
              <ul className="max-h-60 overflow-y-auto border border-black/5 rounded-lg p-2 space-y-1">
                {fields.map((f) => {
                  const checked = newFormFields.has(f.name);
                  const required = newFormRequired.has(f.name);
                  return (
                    <li
                      key={f.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const s = new Set(newFormFields);
                          if (e.target.checked) s.add(f.name);
                          else s.delete(f.name);
                          setNewFormFields(s);
                        }}
                      />
                      <span className="flex-1">{f.name}</span>
                      <span className="text-xs text-text-secondary">{f.type}</span>
                      <label className="text-xs text-text-secondary inline-flex items-center gap-1">
                        <input
                          type="checkbox"
                          disabled={!checked}
                          checked={required}
                          onChange={(e) => {
                            const s = new Set(newFormRequired);
                            if (e.target.checked) s.add(f.name);
                            else s.delete(f.name);
                            setNewFormRequired(s);
                          }}
                        />
                        必填
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setCreatingForm(false)}
                  className="px-3 py-1.5 rounded-lg border border-black/10 text-sm"
                >
                  取消
                </button>
                <button
                  onClick={async () => {
                    if (!id) return;
                    if (newFormFields.size === 0) {
                      showToast('请至少勾选一个字段', 'error');
                      return;
                    }
                    try {
                      const payload = {
                        title: newFormTitle.trim() || '未命名表单',
                        description: newFormDesc.trim() || null,
                        fields: Array.from(newFormFields).map((name) => ({
                          name,
                          required: newFormRequired.has(name),
                        })),
                      };
                      const { data } = await api.post<{ form: TableFormView }>(
                        `/forms/by-table/${id}`,
                        payload,
                      );
                      setFormsList((arr) => [data.form, ...arr]);
                      setCreatingForm(false);
                      showToast('表单已创建', 'success');
                    } catch (err) {
                      showToast(asApiError(err).error, 'error');
                    }
                  }}
                  className="px-4 py-1.5 rounded-lg bg-liquid-indigo text-white text-sm"
                >
                  创建表单
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>


      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Stat label="记录" value={stats.recordCount} />
        <Stat label="字段" value={stats.fieldCount} />
        <Stat label="当前视图" value={stats.visibleCount} />
        <Stat label="填写率" value={`${stats.fillRate}%`} />
        <Stat
          label={stats.avgProgress === null ? '完成项' : '平均进度'}
          value={
            stats.avgProgress === null
              ? stats.checkboxRate === null
                ? '—'
                : `${stats.checkboxRate}%`
              : `${stats.avgProgress}%`
          }
        />
      </div>

      <div className="glass-panel rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            {canWrite && (
              <>
                <button
                  onClick={addRecord}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-liquid-indigo rounded-lg hover:bg-primary transition-colors"
                >
                  <Plus size={14} /> 新增记录
                </button>
                <button
                  onClick={() => setAddingField(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-secondary border border-black/10 rounded-lg hover:bg-black/5 transition-colors"
                >
                  <Plus size={14} /> 新增字段
                </button>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center p-1 bg-surface-container rounded-lg">
              <ViewBtn active={view === 'table'} onClick={() => setView('table')} icon={<LayoutList size={14} />}>表格</ViewBtn>
              <ViewBtn active={view === 'kanban'} onClick={() => setView('kanban')} icon={<Columns size={14} />}>看板</ViewBtn>
              <ViewBtn active={view === 'calendar'} onClick={() => setView('calendar')} icon={<Calendar size={14} />}>日历</ViewBtn>
              <ViewBtn active={view === 'gantt'} onClick={() => setView('gantt')} icon={<GanttChartSquare size={14} />}>甘特</ViewBtn>
            </div>

            <select
              value={filterField ?? ''}
              onChange={(e) => setFilterField(e.target.value || null)}
              className="h-8 px-2 text-sm rounded-lg border border-black/10 bg-white text-text-secondary"
            >
              <option value="">按字段筛选…</option>
              {fields.map((f) => (
                <option key={f.id} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
            {filterField && (
              <input
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                placeholder="包含…"
                className="h-8 px-2 text-sm rounded-lg border border-black/10 bg-white w-32"
              />
            )}

            <select
              value={sortField ?? ''}
              onChange={(e) => setSortField(e.target.value || null)}
              className="h-8 px-2 text-sm rounded-lg border border-black/10 bg-white text-text-secondary"
            >
              <option value="">按字段排序…</option>
              {fields.map((f) => (
                <option key={f.id} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
            {sortField && (
              <button
                onClick={() => setSortAsc((v) => !v)}
                className="h-8 px-2 text-sm rounded-lg border border-black/10 bg-white text-text-secondary hover:bg-black/5"
              >
                {sortAsc ? '升序' : '降序'}
              </button>
            )}
            {view === 'table' && (
              <button
                onClick={() => {
                  setAutoFitTable((v) => !v);
                  showToast(autoFitTable ? '已恢复默认表格宽度' : '已自动排版表格', 'success');
                }}
                className={`h-8 px-3 text-sm rounded-lg border inline-flex items-center gap-1.5 transition-colors ${
                  autoFitTable
                    ? 'border-liquid-indigo/30 bg-liquid-indigo/10 text-liquid-indigo'
                    : 'border-black/10 bg-white text-text-secondary hover:bg-black/5'
                }`}
              >
                <Sparkles size={14} /> 自动排版
              </button>
            )}
          </div>
        </div>

        {addingField && (
          <div className="bg-white/80 border border-black/10 rounded-xl p-3 mb-4 flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <input
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                placeholder="字段名称"
                className="flex-1 h-8 px-2 text-sm rounded-lg border border-black/10 bg-white"
              />
              <select
                value={newFieldType}
                onChange={(e) => {
                  setNewFieldType(e.target.value);
                  if (e.target.value !== 'formula') setNewFieldFormula('');
                  if (e.target.value !== 'select' && e.target.value !== 'multiselect') {
                    setNewFieldChoices('');
                  }
                }}
                className="h-8 px-2 text-sm rounded-lg border border-black/10 bg-white"
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                onClick={addField}
                className="h-8 px-3 text-sm rounded-lg bg-liquid-indigo text-white hover:bg-primary"
              >
                添加
              </button>
              <button
                onClick={() => {
                  setAddingField(false);
                  setNewFieldFormula('');
                  setNewFieldChoices('');
                }}
                className="h-8 px-3 text-sm rounded-lg text-text-secondary hover:bg-black/5"
              >
                取消
              </button>
            </div>
            {newFieldType === 'formula' && (
              <div className="flex flex-col gap-1">
                <input
                  value={newFieldFormula}
                  onChange={(e) => setNewFieldFormula(e.target.value)}
                  placeholder="公式，例如：{数量} * {单价}  或  SUM({A}, {B})"
                  className="h-8 px-2 text-sm rounded-lg border border-black/10 bg-white font-mono"
                />
                <div className="text-[11px] text-text-secondary">
                  使用 <code className="px-1 bg-black/5 rounded">{'{字段名}'}</code> 引用其他字段。支持 SUM、AVG、MAX、MIN、COUNT、IF、CONCAT、ROUND、ABS、UPPER、LOWER、LEN、NOW、TODAY、YEAR、MONTH、DAY、DAYS、AND、OR、NOT 等函数。
                </div>
              </div>
            )}
            {(newFieldType === 'select' || newFieldType === 'multiselect') && (
              <div className="flex flex-col gap-1">
                <textarea
                  value={newFieldChoices}
                  onChange={(e) => setNewFieldChoices(e.target.value)}
                  placeholder="选项，每行一个；也可以用逗号分隔，例如：待开始，进行中，已完成"
                  rows={2}
                  className="px-2 py-1.5 text-sm rounded-lg border border-black/10 bg-white"
                />
                <div className="text-[11px] text-text-secondary">
                  选项会用于表格单选 / 多选、看板分组和筛选。
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'table' && (
          <TableView
            fields={fields}
            records={visibleRecords}
            onUpdate={updateCell}
            onRemove={removeRecord}
            onDuplicate={duplicateRecord}
            onRemoveField={removeField}
            canWrite={canWrite}
            requestUpload={requestUpload}
            autoFit={autoFitTable}
          />
        )}
        {view === 'kanban' && (
          <KanbanView
            fields={fields}
            records={visibleRecords}
            onUpdate={updateCell}
            canWrite={canWrite}
          />
        )}
        {view === 'calendar' && (
          <CalendarViewLocal fields={fields} records={visibleRecords} />
        )}
        {view === 'gantt' && <GanttView fields={fields} records={visibleRecords} />}
      </div>
    </div>
  );
}

function ViewBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1 text-sm rounded ${
        active ? 'bg-liquid-indigo text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function PlaceholderView({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="border border-dashed border-black/15 rounded-2xl p-12 text-center text-text-secondary">
      <div className="flex justify-center text-text-secondary mb-3">{icon}</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

function parseChoices(value: string) {
  const seen = new Set<string>();
  return value
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, 50);
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-black/5 bg-surface-container-lowest px-3 py-2">
      <div className="text-[11px] text-text-secondary">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-text-primary">{value}</div>
    </div>
  );
}

function getDisplayTitle(record: TableRecord, fields: TableField[]): string {
  const text = fields.find((f) => f.type === 'text' || f.type === 'longtext');
  if (text) {
    const v = record.data[text.name];
    if (typeof v === 'string' && v.trim()) return v;
  }
  for (const f of fields) {
    const v = record.data[f.name];
    if (typeof v === 'string' && v.trim()) return v;
    if (typeof v === 'number') return String(v);
  }
  return '未命名';
}

function getRecordDate(record: TableRecord, fields: TableField[]): Date | null {
  const dateField = fields.find((f) => f.type === 'date' || f.type === 'datetime');
  if (!dateField) return null;
  const v = record.data[dateField.name];
  if (!v) return null;
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function getKanbanField(fields: TableField[]): TableField | null {
  return fields.find((f) => f.type === 'select') || null;
}

function KanbanView({
  fields,
  records,
  onUpdate,
  canWrite,
}: {
  fields: TableField[];
  records: TableRecord[];
  onUpdate: (recordId: string, field: TableField, value: unknown) => void;
  canWrite: boolean;
}) {
  const groupField = getKanbanField(fields);
  if (!groupField) {
    return (
      <div className="border border-dashed border-black/15 rounded-2xl p-10 text-center text-sm text-text-secondary">
        <div className="flex justify-center mb-3">
          <Columns size={28} />
        </div>
        看板视图需要表格中至少有一个「单选」字段作为分组依据。
        <br />
        请在「新增字段」中创建一个单选字段（例如「状态」）。
      </div>
    );
  }
  const opts = (groupField.options?.choices as string[] | undefined) ?? [];
  const groups: { key: string; label: string; records: TableRecord[] }[] = [
    { key: '__none__', label: '未分类', records: [] },
    ...opts.map((o) => ({ key: o, label: o, records: [] as TableRecord[] })),
  ];
  const knownKeys = new Set(groups.map((g) => g.key));
  for (const r of records) {
    const v = r.data[groupField.name];
    const key = typeof v === 'string' && v ? v : '__none__';
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, label: key, records: [] };
      groups.push(g);
      knownKeys.add(key);
    }
    g.records.push(r);
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-3 min-w-full">
        {groups.map((g) => (
          <div
            key={g.key}
            className="w-72 shrink-0 bg-black/[0.03] rounded-xl p-2 min-h-[200px]"
            onDragOver={(e) => {
              if (canWrite) e.preventDefault();
            }}
            onDrop={(e) => {
              if (!canWrite) return;
              const id = e.dataTransfer.getData('text/recordId');
              if (!id) return;
              const target = records.find((r) => r.id === id);
              if (!target) return;
              const next = g.key === '__none__' ? '' : g.key;
              if ((target.data[groupField.name] ?? '') === next) return;
              onUpdate(id, groupField, next);
            }}
          >
            <div className="px-2 py-1 text-xs font-semibold text-text-secondary flex items-center justify-between">
              <span>{g.label}</span>
              <span className="text-[11px] text-text-secondary/70">{g.records.length}</span>
            </div>
            <div className="space-y-2 mt-2">
              {g.records.map((r) => (
                <div
                  key={r.id}
                  draggable={canWrite}
                  onDragStart={(e) => e.dataTransfer.setData('text/recordId', r.id)}
                  className="bg-white rounded-lg border border-black/5 p-2 text-sm shadow-sm hover:shadow h-28 overflow-hidden flex flex-col"
                >
                  <div className="font-medium text-text-primary line-clamp-2 min-h-[2.5rem]">
                    {getDisplayTitle(r, fields)}
                  </div>
                  <div className="mt-1 space-y-0.5 text-xs text-text-secondary flex-1 overflow-hidden">
                    {fields
                      .filter(
                        (f) =>
                          f.id !== groupField.id &&
                          f.type !== 'longtext' &&
                          f.type !== 'attachment',
                      )
                      .slice(0, 3)
                      .map((f) => {
                        const v = r.data[f.name];
                        if (v === null || v === undefined || v === '') return null;
                        const txt = Array.isArray(v) ? v.join(', ') : String(v);
                        return (
                          <div key={f.id} className="truncate">
                            <span className="text-text-secondary/70 mr-1">{f.name}:</span>
                            {txt}
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
              {g.records.length === 0 && (
                <div className="text-xs text-text-secondary/60 px-2 py-3 text-center">
                  拖动卡片到此分组
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarViewLocal({
  fields,
  records,
}: {
  fields: TableField[];
  records: TableRecord[];
}) {
  const [view, setView] = useState(() => new Date());
  const dateField = fields.find((f) => f.type === 'date' || f.type === 'datetime');
  if (!dateField) {
    return (
      <div className="border border-dashed border-black/15 rounded-2xl p-10 text-center text-sm text-text-secondary">
        <div className="flex justify-center mb-3">
          <Calendar size={28} />
        </div>
        日历视图需要表格中至少有一个「日期」或「日期时间」字段。
      </div>
    );
  }
  const start = new Date(view.getFullYear(), view.getMonth(), 1);
  const startWeekday = start.getDay();
  const cells: Date[] = [];
  const firstCell = new Date(start);
  firstCell.setDate(start.getDate() - startWeekday);
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(firstCell);
    d.setDate(firstCell.getDate() + i);
    cells.push(d);
  }
  function sameDay(a: Date, b: Date) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }
  const itemsOn = (d: Date) =>
    records.filter((r) => {
      const rd = getRecordDate(r, fields);
      return rd ? sameDay(rd, d) : false;
    });
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-text-secondary">
          按「{dateField.name}」字段排布 · {view.getFullYear()} 年 {view.getMonth() + 1} 月
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
            className="px-2 py-1 text-xs rounded hover:bg-black/5"
          >
            ‹
          </button>
          <button
            onClick={() => setView(new Date())}
            className="px-2 py-1 text-xs rounded hover:bg-black/5"
          >
            本月
          </button>
          <button
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
            className="px-2 py-1 text-xs rounded hover:bg-black/5"
          >
            ›
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-[11px] text-text-secondary border-b border-black/5">
        {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
          <div key={d} className="px-2 py-1.5 text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const items = itemsOn(d);
          const inMonth = d.getMonth() === view.getMonth();
          return (
            <div
              key={d.toISOString()}
              className={`min-h-[88px] border border-black/5 -ml-px -mt-px p-1.5 ${
                inMonth ? '' : 'opacity-50'
              }`}
            >
              <div className="text-[11px] text-text-secondary">{d.getDate()}</div>
              <div className="mt-1 space-y-0.5">
                {items.slice(0, 3).map((r) => (
                  <div
                    key={r.id}
                    className="text-[11px] truncate bg-liquid-indigo/10 text-liquid-indigo rounded px-1 py-0.5"
                  >
                    {getDisplayTitle(r, fields)}
                  </div>
                ))}
                {items.length > 3 && (
                  <div className="text-[10px] text-text-secondary">+{items.length - 3} 更多</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TableView({
  fields,
  records,
  onUpdate,
  onRemove,
  onDuplicate,
  onRemoveField,
  canWrite,
  requestUpload,
  autoFit,
}: {
  fields: TableField[];
  records: TableRecord[];
  onUpdate: (recordId: string, field: TableField, value: unknown) => void;
  onRemove: (recordId: string) => void;
  onDuplicate: (record: TableRecord) => void;
  onRemoveField: (fieldId: string) => void;
  canWrite: boolean;
  requestUpload: () => Promise<Attachment | null>;
  autoFit: boolean;
}) {
  const columnWidths = useMemo(
    () => (autoFit ? getAutoColumnWidths(fields, records) : []),
    [autoFit, fields, records],
  );
  const tableMinWidth = autoFit
    ? columnWidths.reduce((sum, width) => sum + width, 88)
    : undefined;

  return (
    <div className="overflow-x-auto">
      <table
        className={`border-collapse text-sm ${autoFit ? '' : 'min-w-full'}`}
        style={autoFit ? { minWidth: tableMinWidth } : undefined}
      >
        {autoFit && (
          <colgroup>
            {fields.map((f, index) => (
              <col key={f.id} style={{ width: columnWidths[index] }} />
            ))}
            <col style={{ width: 88 }} />
          </colgroup>
        )}
        <thead>
          <tr className="text-text-secondary border-b border-black/5">
            {fields.map((f, index) => (
              <th
                key={f.id}
                className="px-3 py-2 font-medium whitespace-nowrap group text-center"
                style={autoFit ? { width: columnWidths[index] } : undefined}
              >
                <div className="flex items-center justify-center gap-2">
                  {f.name}
                  <span className="text-[10px] uppercase tracking-wider text-text-secondary/70">
                    {f.type}
                  </span>
                  {canWrite && (
                    <button
                      onClick={() => onRemoveField(f.id)}
                      className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-red-500"
                      title="删除字段"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </th>
            ))}
            <th className="px-3 py-2 w-12" />
          </tr>
        </thead>
        <tbody>
          {records.length === 0 && (
            <tr>
              <td
                colSpan={fields.length + 1}
                className="px-3 py-8 text-center text-sm text-text-secondary"
              >
                暂无记录，点击「新增记录」开始录入。
              </td>
            </tr>
          )}
          {records.map((r) => (
            <tr key={r.id} className="h-12 border-b border-black/5 hover:bg-black/[0.02] group">
              {fields.map((f, index) => (
                <td
                  key={f.id}
                  className="h-12 px-3 py-1.5 align-middle text-left"
                  style={autoFit ? { width: columnWidths[index] } : undefined}
                >
                  <div className="flex h-8 max-h-8 items-center justify-start overflow-hidden">
                    {f.type === 'formula' ? (
                      <FormulaCell field={f} record={r} fields={fields} records={records} />
                    ) : (
                      <CellEditor
                        field={f}
                        value={r.data[f.name]}
                        onChange={(v) => onUpdate(r.id, f, v)}
                        readonly={!canWrite}
                        requestUpload={requestUpload}
                      />
                    )}
                  </div>
                </td>
              ))}
              <td className="h-12 px-3 py-1.5 align-middle text-left">
                <div className="flex h-8 items-center gap-1">
                  {canWrite && (
                    <>
                      <button
                        onClick={() => onDuplicate(r)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-text-secondary hover:text-liquid-indigo hover:bg-black/5"
                        title="复制记录"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={() => onRemove(r.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-text-secondary hover:text-red-500 hover:bg-black/5"
                        title="删除记录"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getAutoColumnWidths(fields: TableField[], records: TableRecord[]): number[] {
  return fields.map((field) => {
    const headerWidth = measureTextWidth(`${field.name} ${field.type}`) + 64;
    const contentWidth = records.reduce((max, record) => {
      const display = getCellDisplayValue(field, record, fields, records);
      return Math.max(max, measureTextWidth(display) + 40);
    }, headerWidth);
    return Math.min(Math.max(contentWidth, getMinColumnWidth(field)), getMaxColumnWidth(field));
  });
}

function getMinColumnWidth(field: TableField): number {
  if (field.type === 'checkbox') return 96;
  if (field.type === 'number' || field.type === 'rating' || field.type === 'progress') return 112;
  if (field.type === 'date') return 140;
  if (field.type === 'datetime') return 190;
  if (field.type === 'attachment') return 180;
  return 140;
}

function getMaxColumnWidth(field: TableField): number {
  if (field.type === 'longtext') return 420;
  if (field.type === 'attachment' || field.type === 'multiselect') return 360;
  return 320;
}

function measureTextWidth(text: string): number {
  return Array.from(text).reduce((sum, char) => {
    if (char.charCodeAt(0) <= 0x7f) return sum + 7;
    return sum + 14;
  }, 0);
}

function getCellDisplayValue(
  field: TableField,
  record: TableRecord,
  fields: TableField[],
  records: TableRecord[],
): string {
  if (field.type === 'formula') {
    const expression = (field.options?.formula as string) || '';
    if (!expression) return '';
    const result = evalFormula(expression, {
      fields: fields.map((f) => ({ id: f.id, name: f.name, type: f.type })),
      current: record.data,
      records: records.map((r) => r.data),
    });
    return result.error ? '#错误' : formatFormulaValue(result.value);
  }

  const value = record.data[field.name];
  if (field.type === 'attachment') {
    const list = Array.isArray(value) ? (value as Attachment[]) : [];
    return list.map((a) => displayFilename(a.originalName)).join(', ');
  }
  if (field.type === 'checkbox') return value ? '已勾选' : '';
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ');
  return value == null ? '' : String(value);
}

function CellEditor({
  field,
  value,
  onChange,
  readonly,
  requestUpload,
}: {
  field: TableField;
  value: unknown;
  onChange: (v: unknown) => void;
  readonly: boolean;
  requestUpload: () => Promise<Attachment | null>;
}) {
  if (field.type === 'attachment') {
    const list = (Array.isArray(value) ? (value as Attachment[]) : []) as Attachment[];
    return (
      <div className="flex flex-wrap items-center gap-2">
        {list.map((a) => (
          <span
            key={a.id}
            className="inline-flex items-center gap-1 text-xs bg-liquid-indigo/10 text-liquid-indigo px-2 py-0.5 rounded-full max-w-[180px]"
          >
            <Paperclip size={10} />
            <a href={a.url} target="_blank" rel="noopener" className="truncate hover:underline">
              {displayFilename(a.originalName)}
            </a>
            {!readonly && (
              <button
                onClick={() => onChange(list.filter((x) => x.id !== a.id))}
                className="text-text-secondary hover:text-red-500"
                title="移除"
              >
                ✕
              </button>
            )}
          </span>
        ))}
        {!readonly && (
          <button
            onClick={async () => {
              const att = await requestUpload();
              if (att) onChange([...list, att]);
            }}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-dashed border-black/15 text-text-secondary hover:border-liquid-indigo hover:text-liquid-indigo"
          >
            <Upload size={10} /> 上传
          </button>
        )}
      </div>
    );
  }
  if (readonly) {
    return (
      <div className="px-2 py-1 text-sm text-text-secondary truncate max-w-[400px]">
        {Array.isArray(value)
          ? (value as unknown[]).join(', ')
          : value == null
            ? ''
            : String(value)}
      </div>
    );
  }
  switch (field.type) {
    case 'longtext':
      return (
        <textarea
          rows={1}
          value={String(value ?? '')}
          onBlur={(e) => onChange(e.target.value)}
          defaultValue={String(value ?? '')}
          onChange={() => {}}
          className="w-full min-w-32 max-w-[400px] px-2 py-1 text-sm bg-transparent border border-transparent hover:border-black/10 focus:border-liquid-indigo rounded outline-none resize-none"
        />
      );
    case 'number':
    case 'rating':
    case 'progress':
      return (
        <input
          type="number"
          defaultValue={value == null ? '' : String(value)}
          onBlur={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="w-24 px-2 py-1 text-sm bg-transparent border border-transparent hover:border-black/10 focus:border-liquid-indigo rounded outline-none"
        />
      );
    case 'date':
      return (
        <input
          type="date"
          defaultValue={value ? String(value).slice(0, 10) : ''}
          onBlur={(e) => onChange(e.target.value || null)}
          className="px-2 py-1 text-sm bg-transparent border border-transparent hover:border-black/10 focus:border-liquid-indigo rounded outline-none"
        />
      );
    case 'datetime':
      return (
        <input
          type="datetime-local"
          defaultValue={value ? String(value).slice(0, 16) : ''}
          onBlur={(e) => onChange(e.target.value || null)}
          className="px-2 py-1 text-sm bg-transparent border border-transparent hover:border-black/10 focus:border-liquid-indigo rounded outline-none"
        />
      );
    case 'checkbox':
      return (
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case 'select':
    case 'multiselect': {
      const choices = (field.options?.choices as string[]) ?? [];
      if (field.type === 'multiselect') {
        const arr = Array.isArray(value) ? (value as string[]) : value ? [String(value)] : [];
        return (
          <div className="flex flex-wrap gap-1">
            {choices.map((c) => {
              const on = arr.includes(c);
              return (
                <button
                  key={c}
                  onClick={() =>
                    onChange(on ? arr.filter((v) => v !== c) : [...arr, c])
                  }
                  className={`text-xs px-2 py-0.5 rounded-full border ${
                    on
                      ? 'bg-liquid-indigo/15 text-liquid-indigo border-liquid-indigo/30'
                      : 'bg-white text-text-secondary border-black/10 hover:border-liquid-indigo/30'
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        );
      }
      return (
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value || null)}
          className="px-2 py-1 text-sm bg-transparent border border-transparent hover:border-black/10 focus:border-liquid-indigo rounded outline-none"
        >
          <option value="">—</option>
          {choices.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      );
    }
    default:
      return (
        <input
          type="text"
          defaultValue={String(value ?? '')}
          onBlur={(e) => onChange(e.target.value)}
          className="w-full min-w-32 px-2 py-1 text-sm bg-transparent border border-transparent hover:border-black/10 focus:border-liquid-indigo rounded outline-none"
        />
      );
  }
}

function FormulaCell({
  field,
  record,
  fields,
  records,
}: {
  field: TableField;
  record: TableRecord;
  fields: TableField[];
  records: TableRecord[];
}) {
  const expression = (field.options?.formula as string) || '';
  if (!expression) {
    return <span className="text-xs text-text-secondary italic">未配置公式</span>;
  }
  const result = evalFormula(expression, {
    fields: fields.map((f) => ({ id: f.id, name: f.name, type: f.type })),
    current: record.data,
    records: records.map((r) => r.data),
  });
  if (result.error) {
    return (
      <span
        className="text-xs text-red-500"
        title={`公式错误：${result.error}\n表达式：${expression}`}
      >
        #错误
      </span>
    );
  }
  return (
    <span
      className="text-sm text-text-primary px-2 py-1 inline-block"
      title={`公式：${expression}`}
    >
      {formatFormulaValue(result.value) || (
        <span className="text-text-secondary text-xs">—</span>
      )}
    </span>
  );
}
