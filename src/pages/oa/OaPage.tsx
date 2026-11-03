import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  FileSpreadsheet,
  Minimize2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import { useUiStore } from '../../store/ui';
import { Modal } from '../../components/Modal';

type LeaveType = 'personal' | 'adjusted' | 'comp' | 'annual';
type LeaveTypeInput = LeaveType | 'auto';
type LeaveUnit = 'full' | 'am' | 'pm';
type HolidayRegion = 'mainland' | 'hongkong' | 'both' | 'manual';
type DashboardView = 'calendar' | 'employees' | 'maintenance';
type CalendarRegionFilter = 'all' | 'mainland' | 'hongkong';

interface Employee {
  id: number;
  name: string;
  hireDate: string | null;
  annualAdjustment: number;
  compAdjustment: number;
  createdAt: string;
}

interface Holiday {
  id: number;
  date: string;
  region: HolidayRegion;
  name: string;
  isWorkday: boolean;
  source: string;
}

interface LeaveRecord {
  id: number;
  employeeId: number;
  employeeName: string;
  type: LeaveType;
  unit: LeaveUnit;
  startDate: string;
  endDate: string;
  days: number;
  createdAt: string;
}

interface HolidayWorkRecord {
  id: number;
  employeeId: number;
  employeeName: string;
  workDate: string;
  hours: number;
  days: number;
  createdAt: string;
}

interface Memo {
  id: number;
  employeeId: number;
  employeeName: string;
  memoDate: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface OperationLog {
  id: number;
  operator: string;
  action: string;
  targetType: string;
  targetId: number | null;
  detail: string;
  createdAt: string;
}

interface EmployeeStats {
  employeeId: number;
  employeeName: string;
  personalUsed: number;
  adjustedUsed: number;
  monthlyUsed: number;
  yearlyUsed: number;
  compUsed: number;
  compEarned: number;
  annualUsed: number;
  annualGranted: number;
  annualAdjustment: number;
  compAdjustment: number;
  annualBalance: number;
  compBalance: number;
  totalBalance: number;
}

interface DashboardData {
  employees: Employee[];
  holidays: Holiday[];
  records: LeaveRecord[];
  holidayWorkRecords: HolidayWorkRecord[];
  memos: Memo[];
  operationLogs: OperationLog[];
  stats: EmployeeStats[];
}

interface CalendarEvent {
  id: string;
  date: string;
  label: string;
  tone: 'annual' | 'comp' | 'personal' | 'adjusted' | 'work';
}

interface ImportPreviewRow {
  row: number;
  name: string;
  startDate: string;
  endDate: string;
  unit: string;
  type: string;
  problem: string | null;
}

interface ImportResult {
  inserted: number;
  failed: Array<{ row: number; reason: string }>;
}

const PAGE_SIZE = 10;
const LOG_PAGE_SIZE = 20;
const OVERTIME_HOURS_PER_COMP_DAY = 8;
const overtimeQuickHours = [1, 2, 4, 8] as const;

const leaveTypeLabels: Record<LeaveType, string> = {
  personal: '请假',
  adjusted: '调假',
  comp: '调休',
  annual: '年假',
};

const leaveUnitLabels: Record<LeaveUnit, string> = {
  full: '全天',
  am: '上午半天',
  pm: '下午半天',
};

const holidayRegionLabels: Record<HolidayRegion, string> = {
  mainland: '大陆假日',
  hongkong: '香港假日',
  both: '两地同休',
  manual: '手动假日',
};

const leaveTypeOptions: Array<{ value: LeaveType | 'all'; label: string }> = [
  { value: 'all', label: '全部类型' },
  { value: 'personal', label: '请假' },
  { value: 'adjusted', label: '调假' },
  { value: 'comp', label: '调休' },
  { value: 'annual', label: '年假' },
];

const calendarRegionOptions: Array<{ value: CalendarRegionFilter; label: string }> = [
  { value: 'all', label: '全部地区' },
  { value: 'mainland', label: '大陆' },
  { value: 'hongkong', label: '香港' },
];

const fieldCls =
  'w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-text-primary outline-none focus:border-liquid-indigo';
const fieldSmCls =
  'rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm text-text-primary outline-none focus:border-liquid-indigo';
const fieldTblCls =
  'rounded-lg border border-black/10 bg-white px-2 py-1 text-sm text-text-primary outline-none focus:border-liquid-indigo';
const btnPrimaryCls =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-liquid-indigo px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50';
const btnGhostCls =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-text-secondary hover:bg-black/5 disabled:opacity-40';
const btnDangerIconCls =
  'inline-flex size-8 items-center justify-center rounded-lg border border-red-200 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-40';
const btnIconCls =
  'inline-flex size-8 items-center justify-center rounded-lg border border-black/10 text-text-secondary transition-colors hover:bg-black/5 disabled:opacity-40';

const shanghaiDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function todayShanghai(): string {
  return shanghaiDay.format(new Date());
}

function currentYearShanghai(): number {
  return Number(todayShanghai().slice(0, 4));
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const rounded = Math.round(value * 100) / 100;
  return `${Object.is(rounded, -0) ? 0 : rounded}`;
}

function formatDaysAsDuration(days: number): string {
  if (!Number.isFinite(days)) return '-';
  const sign = days < 0 ? '-' : '';
  const totalHours = Math.round(Math.abs(days) * OVERTIME_HOURS_PER_COMP_DAY * 2) / 2;
  const wholeDays = Math.floor(totalHours / OVERTIME_HOURS_PER_COMP_DAY);
  const hours = totalHours - wholeDays * OVERTIME_HOURS_PER_COMP_DAY;
  return `${sign}${wholeDays}d${hours === 0 ? '' : `${formatNumber(hours)}h`}`;
}

function formatDateTimeShanghai(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' });
}

function downloadFile(filename: string, content: BlobPart, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toCsv(rows: string[][]): string {
  return rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n');
}

function oaErrorMessage(err: unknown): string {
  const ax = err as {
    response?: { data?: { message?: string; error?: string } };
    message?: string;
  };
  return (
    ax?.response?.data?.message ??
    ax?.response?.data?.error ??
    (err instanceof Error ? err.message : '') ??
    '操作失败'
  );
}

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function OaPage() {
  const showToast = useUiStore((s) => s.showToast);
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'ADMIN';

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState<DashboardView>('calendar');

  const [selectedDate, setSelectedDate] = useState(() => todayShanghai());
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState<LeaveType | 'all'>('all');
  const [hireDateFrom, setHireDateFrom] = useState('');
  const [hireDateTo, setHireDateTo] = useState('');
  const [calendarRegionFilter, setCalendarRegionFilter] =
    useState<CalendarRegionFilter>('all');
  const [memoMonth, setMemoMonth] = useState(() => todayShanghai().slice(0, 7));
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const [dateFilter, setDateFilter] = useState<string | null>(null);

  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logPage, setLogPage] = useState(1);
  const [logsLoading, setLogsLoading] = useState(false);

  const [editingLeave, setEditingLeave] = useState<LeaveRecord | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportPreviewRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [reportEmployeeId, setReportEmployeeId] = useState('');

  const [leaveForm, setLeaveForm] = useState({
    employeeId: '',
    type: 'auto' as LeaveTypeInput,
    unit: 'full' as LeaveUnit,
    startDate: '',
    endDate: '',
  });
  const [overtimeForm, setOvertimeForm] = useState({
    employeeId: '',
    workDate: '',
    hours: '8',
  });
  const [employeeForm, setEmployeeForm] = useState({
    name: '',
    hireDate: '',
    annualAdjustment: '',
    compAdjustment: '',
  });
  const [holidayForm, setHolidayForm] = useState({
    date: '',
    region: 'mainland' as HolidayRegion,
    name: '',
    isWorkday: false,
  });
  const [syncResult, setSyncResult] = useState<{
    added: number;
    updated: number;
    failed: string[];
  } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: payload } = await api.get<DashboardData>('/oa/dashboard');
      setData(payload);
      setLoadError('');
    } catch (err) {
      setLoadError(oaErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadLogs = useCallback(
    async (page: number) => {
      setLogsLoading(true);
      try {
        const { data: payload } = await api.get<{ total: number; logs: OperationLog[] }>(
          `/oa/logs?limit=${LOG_PAGE_SIZE}&offset=${(page - 1) * LOG_PAGE_SIZE}`,
        );
        setLogs(payload.logs);
        setLogsTotal(payload.total);
      } catch (err) {
        showToast(oaErrorMessage(err), 'error');
      } finally {
        setLogsLoading(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    if (view === 'maintenance') void loadLogs(logPage);
  }, [view, logPage, loadLogs]);

  const runWrite = useCallback(
    async <T,>(fn: () => Promise<T>, success: string): Promise<T | null> => {
      try {
        const res = await fn();
        showToast(success, 'success');
        await load();
        if (view === 'maintenance') void loadLogs(logPage);
        return res;
      } catch (err) {
        showToast(oaErrorMessage(err), 'error');
        return null;
      }
    },
    [load, loadLogs, logPage, showToast, view],
  );

  const employees = data?.employees ?? [];
  const holidays = data?.holidays ?? [];
  const records = data?.records ?? [];
  const holidayWorkRecords = data?.holidayWorkRecords ?? [];
  const memos = data?.memos ?? [];
  const stats = data?.stats ?? [];

  const holidayMap = useMemo(() => {
    const map = new Map<string, Holiday[]>();
    const filtered =
      calendarRegionFilter === 'all'
        ? holidays
        : holidays.filter(
            (h) => h.region === calendarRegionFilter || h.region === 'both',
          );
    for (const holiday of filtered) {
      map.set(holiday.date, [...(map.get(holiday.date) ?? []), holiday]);
    }
    return map;
  }, [calendarRegionFilter, holidays]);

  const calendarEventMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    const add = (date: string, event: CalendarEvent) => {
      map.set(date, [...(map.get(date) ?? []), event]);
    };
    for (const record of records) {
      const current = parseDateKey(record.startDate);
      const end = parseDateKey(record.endDate);
      while (current <= end) {
        const date = toDateKey(current);
        add(date, {
          id: `leave-${record.id}-${date}`,
          date,
          label: `${record.employeeName} ${leaveTypeLabels[record.type]}`,
          tone: record.type,
        });
        current.setDate(current.getDate() + 1);
      }
    }
    for (const record of holidayWorkRecords) {
      add(record.workDate, {
        id: `work-${record.id}`,
        date: record.workDate,
        label: `${record.employeeName} 加班 ${formatNumber(record.hours)} 小时`,
        tone: 'work',
      });
    }
    return map;
  }, [holidayWorkRecords, records]);

  const employeeMatchesHireDate = useCallback(
    (employee?: Employee) => {
      if (!employee?.hireDate) return !hireDateFrom && !hireDateTo;
      return (
        (!hireDateFrom || employee.hireDate >= hireDateFrom) &&
        (!hireDateTo || employee.hireDate <= hireDateTo)
      );
    },
    [hireDateFrom, hireDateTo],
  );

  const filteredEmployees = useMemo(() => {
    const text = keyword.trim();
    return employees.filter((employee) => {
      const matchesName = !text || employee.name.includes(text);
      return matchesName && employeeMatchesHireDate(employee);
    });
  }, [employees, employeeMatchesHireDate, keyword]);

  const filteredStats = useMemo(() => {
    const ids = new Set(filteredEmployees.map((e) => e.id));
    return stats.filter((stat) => ids.has(stat.employeeId));
  }, [filteredEmployees, stats]);

  const selectedEmployee = useMemo(() => {
    if (!keyword.trim()) return null;
    return filteredStats.find((stat) => stat.employeeName.includes(keyword.trim())) ?? null;
  }, [filteredStats, keyword]);

  const filteredRecords = useMemo(() => {
    const text = keyword.trim();
    return records
      .filter((record) => {
        const matchesEmployee = !text || record.employeeName.includes(text);
        const matchesType = typeFilter === 'all' || record.type === typeFilter;
        const employee = employees.find((item) => item.id === record.employeeId);
        const matchesHireDate = employeeMatchesHireDate(employee);
        const matchesDate =
          !dateFilter || (record.startDate <= dateFilter && dateFilter <= record.endDate);
        return matchesEmployee && matchesType && matchesHireDate && matchesDate;
      })
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [records, employees, employeeMatchesHireDate, keyword, typeFilter, dateFilter]);

  const selectedDateEvents = calendarEventMap.get(selectedDate) ?? [];
  const selectedHolidayLabels = holidayMap.get(selectedDate) ?? [];
  const visibleMemos = useMemo(() => {
    return memos
      .filter((memo) => memo.memoDate.startsWith(memoMonth))
      .sort((a, b) => b.memoDate.localeCompare(a.memoDate));
  }, [memos, memoMonth]);
  const visibleMonthHolidays = useMemo(() => {
    const monthKey = getMonthKey(monthCursor);
    return holidays
      .filter((holiday) => holiday.date.startsWith(monthKey))
      .filter(
        (holiday) =>
          calendarRegionFilter === 'all' ||
          holiday.region === calendarRegionFilter ||
          holiday.region === 'both',
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [calendarRegionFilter, holidays, monthCursor]);

  const paginationResetKeys = {
    employees: [keyword, hireDateFrom, hireDateTo, employees.length, stats.length].join('|'),
    records: [
      keyword,
      typeFilter,
      hireDateFrom,
      hireDateTo,
      dateFilter ?? '',
      employees.length,
      records.length,
    ].join('|'),
    overtime: String(holidayWorkRecords.length),
    memos: [memoMonth, memos.length].join('|'),
  };

  const pageMeta = {
    calendar: { eyebrow: '日历视图', title: '假期日历' },
    employees: { eyebrow: '员工余额、休假与调休', title: '员工假期' },
    maintenance: { eyebrow: '员工、假期与同步', title: '数据维护' },
  }[view];

  const handleSelectDate = useCallback((date: string) => {
    setSelectedDate(date);
    setDateFilter(date);
  }, []);

  // ---- writes ----
  const submitLeave = async () => {
    if (!leaveForm.employeeId) {
      showToast('请先选择员工', 'error');
      return;
    }
    if (!leaveForm.startDate || !leaveForm.endDate) {
      showToast('请先填写开始和结束日期', 'error');
      return;
    }
    setSaving('leave');
    try {
      const ok = await runWrite(
        () =>
          api.post('/oa/leave', {
            employeeId: Number(leaveForm.employeeId),
            type: leaveForm.type,
            unit: leaveForm.unit,
            startDate: leaveForm.startDate,
            endDate: leaveForm.endDate,
          }),
        '已新增休假',
      );
      if (ok) setLeaveForm((f) => ({ ...f, startDate: '', endDate: '' }));
    } finally {
      setSaving(null);
    }
  };

  const submitOvertime = async () => {
    if (!overtimeForm.employeeId) {
      showToast('请先选择员工', 'error');
      return;
    }
    if (!overtimeForm.workDate) {
      showToast('请先填写加班日期', 'error');
      return;
    }
    if (!overtimeForm.hours || Number(overtimeForm.hours) <= 0) {
      showToast('请填写加班小时数', 'error');
      return;
    }
    setSaving('overtime');
    try {
      const ok = await runWrite(
        () =>
          api.post('/oa/overtime', {
            employeeId: Number(overtimeForm.employeeId),
            workDate: overtimeForm.workDate,
            hours: Number(overtimeForm.hours),
          }),
        '已新增加班',
      );
      if (ok) setOvertimeForm((f) => ({ ...f, workDate: '' }));
    } finally {
      setSaving(null);
    }
  };

  const submitEmployee = async () => {
    if (!employeeForm.name.trim()) {
      showToast('请填写完整信息', 'error');
      return;
    }
    setSaving('employee');
    try {
      const ok = await runWrite(
        () =>
          api.post('/oa/employees', {
            name: employeeForm.name.trim(),
            hireDate: employeeForm.hireDate || undefined,
            annualAdjustment: employeeForm.annualAdjustment
              ? Number(employeeForm.annualAdjustment)
              : undefined,
            compAdjustment: employeeForm.compAdjustment
              ? Number(employeeForm.compAdjustment)
              : undefined,
          }),
        '已新增员工',
      );
      if (ok)
        setEmployeeForm({ name: '', hireDate: '', annualAdjustment: '', compAdjustment: '' });
    } finally {
      setSaving(null);
    }
  };

  const submitHoliday = async () => {
    if (!holidayForm.date || !holidayForm.name.trim()) {
      showToast('请填写完整信息', 'error');
      return;
    }
    setSaving('holiday');
    try {
      const ok = await runWrite(
        () =>
          api.post('/oa/holidays', {
            date: holidayForm.date,
            region: holidayForm.region,
            name: holidayForm.name.trim(),
            isWorkday: holidayForm.isWorkday,
          }),
        '已新增假期',
      );
      if (ok) setHolidayForm((f) => ({ ...f, date: '', name: '', isWorkday: false }));
    } finally {
      setSaving(null);
    }
  };

  const syncHolidays = async () => {
    setSaving('sync');
    try {
      const { data: payload } = await api.post<{
        added: number;
        updated: number;
        failed: string[];
      }>('/oa/holidays/sync');
      setSyncResult(payload);
      showToast('同步完成', 'success');
      await load();
      if (view === 'maintenance') void loadLogs(logPage);
    } catch (err) {
      showToast(oaErrorMessage(err), 'error');
    } finally {
      setSaving(null);
    }
  };

  const deleteEmployee = async (id: number, name: string) => {
    if (
      !window.confirm(
        `确定删除员工 ${name} 吗？其全部休假、加班与备忘记录会一并删除。`,
      )
    )
      return;
    await runWrite(() => api.delete(`/oa/employees/${id}`), '已删除');
  };

  const deleteLeave = async (id: number) => {
    if (!window.confirm('确定删除这条休假记录吗？')) return;
    await runWrite(() => api.delete(`/oa/leave/${id}`), '已删除');
  };

  const deleteOvertime = async (id: number) => {
    if (!window.confirm('确定删除这条加班记录吗？')) return;
    await runWrite(() => api.delete(`/oa/overtime/${id}`), '已删除');
  };

  const deleteHoliday = async (id: number) => {
    if (!window.confirm('确定删除这个假期吗？')) return;
    await runWrite(() => api.delete(`/oa/holidays/${id}`), '已删除');
  };

  const deleteMemo = async (id: number) => {
    if (!window.confirm('确定删除这条备忘吗？')) return;
    await runWrite(() => api.delete(`/oa/memos/${id}`), '已删除');
  };

  const saveEmployeeSettings = async (
    id: number,
    patch: { name: string; hireDate: string | null; annualAdjustment: number; compAdjustment: number },
  ) => {
    await runWrite(() => api.patch(`/oa/employees/${id}`, patch), '已保存');
  };

  const saveLeaveEdit = async (
    id: number,
    patch: {
      employeeId: number;
      type: LeaveType;
      unit: LeaveUnit;
      startDate: string;
      endDate: string;
    },
  ) => {
    const ok = await runWrite(() => api.patch(`/oa/leave/${id}`, patch), '已更新休假记录');
    if (ok) setEditingLeave(null);
  };

  const saveMemo = async (
    id: number,
    patch: { employeeId: number; memoDate: string; content: string },
  ) => {
    await runWrite(() => api.patch(`/oa/memos/${id}`, patch), '已更新备忘');
  };

  const submitMemo = async (
    employeeId: string,
    memoDate: string,
    content: string,
  ): Promise<boolean> => {
    if (!employeeId || !memoDate || !content.trim()) {
      showToast('请填写完整信息', 'error');
      return false;
    }
    const ok = await runWrite(
      () =>
        api.post('/oa/memos', {
          employeeId: Number(employeeId),
          memoDate,
          content: content.trim(),
        }),
      '已新增备忘',
    );
    return ok !== null;
  };

  // ---- exports (frontend-generated) ----
  const downloadCsv = () => {
    if (!data) return;
    const rows: string[][] = [
      ['记录类型', '员工', '类型', '单位', '开始日期', '结束日期', '加班小时数', '时长', '年假余额', '调休余额'],
      ...filteredRecords.map((record) => {
        const stat = stats.find((item) => item.employeeId === record.employeeId);
        return [
          '休假',
          record.employeeName,
          leaveTypeLabels[record.type],
          leaveUnitLabels[record.unit],
          record.startDate,
          record.endDate,
          '',
          formatDaysAsDuration(record.days),
          stat ? formatDaysAsDuration(stat.annualBalance) : '',
          stat ? formatDaysAsDuration(stat.compBalance) : '',
        ];
      }),
      ...holidayWorkRecords.map((record) => {
        const stat = stats.find((item) => item.employeeId === record.employeeId);
        return [
          '加班',
          record.employeeName,
          '加班',
          '',
          record.workDate,
          record.workDate,
          `${record.hours}`,
          formatDaysAsDuration(record.days),
          stat ? formatDaysAsDuration(stat.annualBalance) : '',
          stat ? formatDaysAsDuration(stat.compBalance) : '',
        ];
      }),
    ];
    downloadFile(
      `休假加班统计-${todayShanghai()}.csv`,
      `\uFEFF${toCsv(rows)}`,
      'text/csv;charset=utf-8',
    );
  };

  const downloadBackup = () => {
    if (!data) return;
    const backup = {
      exportedAt: new Date().toISOString(),
      format: '2dqy-oa-json-backup-v1',
      tables: {
        employees: data.employees,
        holidays: data.holidays,
        leaveRecords: data.records,
        holidayWorkRecords: data.holidayWorkRecords,
        memos: data.memos,
        operationLogs: data.operationLogs,
      },
      computed: { stats: data.stats },
    };
    downloadFile(
      `2dqy-oa-json-backup-${todayShanghai()}.json`,
      JSON.stringify(backup, null, 2),
      'application/json;charset=utf-8',
    );
  };

  const downloadPersonalReport = () => {
    if (!data) return;
    const stat = stats.find((s) => s.employeeId === Number(reportEmployeeId));
    if (!stat) {
      showToast('请选择要导出的员工', 'error');
      return;
    }
    const year = currentYearShanghai();
    const yearRecords = records
      .filter((r) => r.employeeId === stat.employeeId && r.startDate.startsWith(`${year}-`))
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    const lines: string[][] = [
      ['员工个人休假明细报表'],
      ['员工', stat.employeeName, '年度', String(year)],
      [],
      ['年度统计'],
      ['请假（年）', formatDaysAsDuration(stat.personalUsed)],
      ['调假（年）', formatDaysAsDuration(stat.adjustedUsed)],
      ['调休已用（年）', formatDaysAsDuration(stat.compUsed)],
      ['调休产生（年）', formatDaysAsDuration(stat.compEarned)],
      ['年假已用（历年）', formatDaysAsDuration(stat.annualUsed)],
      ['年假发放', formatDaysAsDuration(stat.annualGranted)],
      ['年假余额', formatDaysAsDuration(stat.annualBalance)],
      ['调休余额', formatDaysAsDuration(stat.compBalance)],
      ['总可用余额', formatDaysAsDuration(stat.totalBalance)],
      [],
      ['休假明细'],
      ['员工', '类型', '单位', '开始日期', '结束日期', '时长'],
      ...yearRecords.map((r) => [
        r.employeeName,
        leaveTypeLabels[r.type],
        leaveUnitLabels[r.unit],
        r.startDate,
        r.endDate,
        formatDaysAsDuration(r.days),
      ]),
    ];
    downloadFile(
      `员工个人休假明细-${stat.employeeName}-${year}.csv`,
      `\uFEFF${toCsv(lines)}`,
      'text/csv;charset=utf-8',
    );
  };

  const downloadSummaryReport = () => {
    if (!data) return;
    const year = currentYearShanghai();
    const lines: string[][] = [
      ['全员休假汇总统计表'],
      ['年度', String(year)],
      [],
      [
        '员工',
        '入职日期',
        '请假（年）',
        '调假（年）',
        '调休已用（年）',
        '调休产生（年）',
        '年假已用（历年）',
        '年假发放',
        '年假余额',
        '调休余额',
        '总可用余额',
        '本月已休',
        '本年已休',
      ],
      ...stats.map((s) => {
        const emp = employees.find((e) => e.id === s.employeeId);
        return [
          s.employeeName,
          emp?.hireDate ?? '',
          formatDaysAsDuration(s.personalUsed),
          formatDaysAsDuration(s.adjustedUsed),
          formatDaysAsDuration(s.compUsed),
          formatDaysAsDuration(s.compEarned),
          formatDaysAsDuration(s.annualUsed),
          formatDaysAsDuration(s.annualGranted),
          formatDaysAsDuration(s.annualBalance),
          formatDaysAsDuration(s.compBalance),
          formatDaysAsDuration(s.totalBalance),
          formatDaysAsDuration(s.monthlyUsed),
          formatDaysAsDuration(s.yearlyUsed),
        ];
      }),
    ];
    downloadFile(
      `全员休假汇总统计-${year}.csv`,
      `\uFEFF${toCsv(lines)}`,
      'text/csv;charset=utf-8',
    );
  };

  // ---- Excel import ----
  const downloadImportTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([['姓名', '开始日期', '结束日期', '单位', '类型']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '休假导入');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    downloadFile(
      '休假导入模板.xlsx',
      buf,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  };

  const handleImportFile = async (file: File) => {
    if (!/\.xlsx$/i.test(file.name)) {
      showToast('仅支持 .xlsx 文件', 'error');
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) {
        showToast('解析失败，请检查文件格式', 'error');
        return;
      }
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][];
      const headerIdx = aoa.findIndex((row) =>
        (row ?? []).some((c) => String(c ?? '').trim() !== ''),
      );
      if (headerIdx < 0) {
        showToast('解析失败，请检查文件格式', 'error');
        return;
      }
      const header = (aoa[headerIdx] ?? []).map((c) => String(c ?? '').trim());
      const col = (name: string) => header.indexOf(name);
      const nameIdx = col('姓名');
      const startIdx = col('开始日期');
      const endIdx = col('结束日期');
      const unitIdx = col('单位');
      const typeIdx = col('类型');
      if (nameIdx < 0 || startIdx < 0 || endIdx < 0 || unitIdx < 0 || typeIdx < 0) {
        showToast('解析失败，请检查文件格式', 'error');
        return;
      }
      const unitMap: Record<string, string> = {
        全天: 'full',
        上午半天: 'am',
        下午半天: 'pm',
        上午: 'am',
        下午: 'pm',
        full: 'full',
        am: 'am',
        pm: 'pm',
      };
      const typeMap: Record<string, string> = {
        请假: 'personal',
        调假: 'adjusted',
        调休: 'comp',
        年假: 'annual',
        自动扣假: 'auto',
        personal: 'personal',
        adjusted: 'adjusted',
        comp: 'comp',
        annual: 'annual',
        auto: 'auto',
      };
      const rows: ImportPreviewRow[] = [];
      for (let i = headerIdx + 1; i < aoa.length; i++) {
        const cells = aoa[i] ?? [];
        if (cells.every((c) => c === '' || c === null || c === undefined)) continue;
        const rowNo = i + 1;
        const name = String(cells[nameIdx] ?? '').trim();
        const startDate = parseExcelDate(cells[startIdx]);
        const endDate = parseExcelDate(cells[endIdx]);
        const unit = unitMap[String(cells[unitIdx] ?? '').trim()] ?? '';
        const type = typeMap[String(cells[typeIdx] ?? '').trim()] ?? '';
        let problem: string | null = null;
        if (!name) problem = '姓名为空';
        else if (!employees.some((e) => e.name === name)) problem = '员工不存在';
        else if (!startDate || !endDate) problem = '日期无效';
        else if (startDate > endDate) problem = '开始日期不能晚于结束日期';
        else if (!unit) problem = '单位无效';
        else if (!type) problem = '类型无效';
        rows.push({ row: rowNo, name, startDate: startDate ?? '', endDate: endDate ?? '', unit, type, problem });
      }
      setImportRows(rows);
      setImportFileName(file.name);
      setImportResult(null);
    } catch {
      showToast('解析失败，请检查文件格式', 'error');
    }
  };

  const confirmImport = async () => {
    const okRows = importRows.filter((r) => !r.problem);
    if (okRows.length === 0) {
      showToast('未找到可导入的有效行', 'error');
      return;
    }
    setImporting(true);
    try {
      const { data: payload } = await api.post<{
        inserted: number;
        errors: Array<{ row: number; reason: string }>;
      }>('/oa/leave/import', {
        rows: okRows.map((r) => ({
          row: r.row,
          name: r.name,
          startDate: r.startDate,
          endDate: r.endDate,
          unit: r.unit,
          type: r.type,
        })),
      });
      const failed = [
        ...importRows
          .filter((r) => r.problem)
          .map((r) => ({ row: r.row, reason: r.problem as string })),
        ...payload.errors,
      ].sort((a, b) => a.row - b.row);
      setImportResult({ inserted: payload.inserted, failed });
      showToast('导入完成', 'success');
      await load();
    } catch (err) {
      showToast(oaErrorMessage(err), 'error');
    } finally {
      setImporting(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex min-h-0 flex-1 flex-col animate-fade-in-up">
        <div className="glass-card rounded-2xl p-8 text-center text-sm text-text-secondary">
          加载中…
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-0 flex-1 flex-col animate-fade-in-up">
        <div className="glass-card space-y-3 rounded-2xl p-8 text-center">
          <p className="text-sm text-text-secondary">数据加载失败</p>
          <button onClick={() => void load()} className={btnGhostCls}>
            <RefreshCw size={14} /> 刷新
          </button>
        </div>
      </div>
    );
  }

  const logTotalPages = Math.max(1, Math.ceil(logsTotal / LOG_PAGE_SIZE));

  return (
    <div className="flex min-h-0 flex-1 flex-col animate-fade-in-up">
      <header className="shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-text-secondary">{pageMeta.eyebrow}</p>
            <h1 className="mt-0.5 flex items-center gap-2 text-2xl font-serif font-bold text-text-primary">
              <CalendarDays size={22} className="text-liquid-indigo" />
              {pageMeta.title}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex rounded-lg border border-black/10 bg-white p-0.5"
              role="tablist"
              aria-label="视图切换"
            >
              {(
                [
                  { key: 'calendar', label: '假期日历', icon: CalendarDays },
                  { key: 'employees', label: '员工假期', icon: Users },
                  { key: 'maintenance', label: '数据维护', icon: Settings2 },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    role="tab"
                    aria-selected={view === tab.key}
                    onClick={() => setView(tab.key)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm',
                      view === tab.key
                        ? 'bg-liquid-indigo font-medium text-white'
                        : 'text-text-secondary hover:bg-black/5',
                    )}
                  >
                    <Icon size={14} /> {tab.label}
                  </button>
                );
              })}
            </div>
            <button onClick={() => void load()} className={btnGhostCls}>
              <RefreshCw size={14} /> 刷新
            </button>
          </div>
        </div>

        {view !== 'maintenance' ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
              />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索员工"
                className="w-52 rounded-lg border border-black/10 bg-white py-2 pl-9 pr-3 text-sm text-text-primary outline-none focus:border-liquid-indigo"
              />
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as LeaveType | 'all')}
              className={fieldSmCls}
              aria-label="类型筛选"
            >
              {leaveTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {view === 'employees' ? (
              <>
                <input
                  type="date"
                  value={hireDateFrom}
                  onChange={(e) => setHireDateFrom(e.target.value)}
                  aria-label="入职日期开始"
                  className={fieldSmCls}
                />
                <input
                  type="date"
                  value={hireDateTo}
                  onChange={(e) => setHireDateTo(e.target.value)}
                  aria-label="入职日期结束"
                  className={fieldSmCls}
                />
              </>
            ) : null}
            {view === 'calendar' ? (
              <select
                value={calendarRegionFilter}
                onChange={(e) => setCalendarRegionFilter(e.target.value as CalendarRegionFilter)}
                className={fieldSmCls}
                aria-label="地区筛选"
              >
                {calendarRegionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : null}
            {isAdmin ? (
              <>
                <button onClick={downloadCsv} className={btnGhostCls}>
                  <Download size={15} /> 导出记录
                </button>
                <button onClick={downloadBackup} className={btnGhostCls}>
                  <Download size={15} /> 备份全部
                </button>
              </>
            ) : null}
          </div>
        ) : null}
        {loadError ? (
          <p className="mt-2 text-xs text-red-600">{loadError}</p>
        ) : null}
      </header>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pb-6">
        {view === 'calendar' ? (
          <div className="space-y-4">
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <section className="min-w-0 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
                <CalendarHeader
                  monthCursor={monthCursor}
                  selectedDate={selectedDate}
                  selectedHolidayLabels={selectedHolidayLabels}
                  expanded={false}
                  onSetMonthCursor={setMonthCursor}
                  onToggleExpanded={() => setCalendarExpanded((v) => !v)}
                />
                <CalendarGrid
                  cursor={monthCursor}
                  expanded={false}
                  selectedDate={selectedDate}
                  holidayMap={holidayMap}
                  eventMap={calendarEventMap}
                  onSelect={handleSelectDate}
                />
              </section>
              <CalendarSidePanel
                selectedDate={selectedDate}
                selectedDateEvents={selectedDateEvents}
                upcomingHolidays={visibleMonthHolidays}
                isAdmin={isAdmin}
                onDeleteHoliday={(id) => void deleteHoliday(id)}
              />
            </div>
            {dateFilter ? (
              <div className="glass-card flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm text-text-secondary">
                <span>
                  仅显示以下日期的记录：
                  {dateFilter}
                </span>
                <button
                  onClick={() => setDateFilter(null)}
                  className="inline-flex items-center gap-1 rounded-lg border border-black/10 px-2 py-1 text-xs hover:bg-black/5"
                >
                  <X size={12} /> 清除筛选
                </button>
                <button
                  onClick={() => setView('employees')}
                  className="text-xs text-liquid-indigo hover:underline"
                >
                  去员工假期查看
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {view === 'employees' ? (
          <div className="space-y-4">
            {selectedEmployee ? <EmployeeFocus stat={selectedEmployee} /> : null}
            <section className="grid min-w-0 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="grid content-start gap-4">
                {isAdmin ? (
                  <>
                    <Panel>
                      <SectionHeading
                        title="新增休假"
                        subtitle="用于实际休哪一天；加班请使用下方登记"
                      />
                      <div className="grid gap-2">
                        <select
                          value={leaveForm.employeeId}
                          onChange={(e) =>
                            setLeaveForm((f) => ({ ...f, employeeId: e.target.value }))
                          }
                          className={fieldCls}
                          aria-label="选择员工"
                        >
                          <option value="" disabled>
                            选择员工
                          </option>
                          {employees.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                              {employee.name}
                            </option>
                          ))}
                        </select>
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={leaveForm.type}
                            onChange={(e) =>
                              setLeaveForm((f) => ({
                                ...f,
                                type: e.target.value as LeaveTypeInput,
                              }))
                            }
                            className={fieldCls}
                            aria-label="休假类型"
                          >
                            <option value="auto">自动扣假</option>
                            <option value="personal">请假</option>
                            <option value="adjusted">调假</option>
                            <option value="comp">调休</option>
                            <option value="annual">年假</option>
                          </select>
                          <select
                            value={leaveForm.unit}
                            onChange={(e) =>
                              setLeaveForm((f) => ({
                                ...f,
                                unit: e.target.value as LeaveUnit,
                              }))
                            }
                            className={fieldCls}
                            aria-label="休假单位"
                          >
                            <option value="full">全天</option>
                            <option value="am">上午半天</option>
                            <option value="pm">下午半天</option>
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="date"
                            value={leaveForm.startDate}
                            onChange={(e) =>
                              setLeaveForm((f) => ({ ...f, startDate: e.target.value }))
                            }
                            className={fieldCls}
                            aria-label="开始日期"
                          />
                          <input
                            type="date"
                            value={leaveForm.endDate}
                            onChange={(e) =>
                              setLeaveForm((f) => ({ ...f, endDate: e.target.value }))
                            }
                            className={fieldCls}
                            aria-label="结束日期"
                          />
                        </div>
                        <button
                          onClick={() => void submitLeave()}
                          disabled={saving === 'leave'}
                          className={btnPrimaryCls}
                        >
                          <Plus size={15} /> 新增休假
                        </button>
                      </div>
                    </Panel>

                    <Panel className="border-amber-200 bg-amber-50/60">
                      <SectionHeading
                        title="加班登记"
                        subtitle="记录工作日、周末或节假日加班，按 8 小时折算 1 天调休"
                      />
                      <div className="grid gap-2">
                        <select
                          value={overtimeForm.employeeId}
                          onChange={(e) =>
                            setOvertimeForm((f) => ({ ...f, employeeId: e.target.value }))
                          }
                          className={fieldCls}
                          aria-label="选择员工"
                        >
                          <option value="" disabled>
                            选择员工
                          </option>
                          {employees.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                              {employee.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="date"
                          value={overtimeForm.workDate}
                          onChange={(e) =>
                            setOvertimeForm((f) => ({ ...f, workDate: e.target.value }))
                          }
                          className={fieldCls}
                          aria-label="加班日期"
                        />
                        <div className="grid gap-2">
                          <label
                            htmlFor="overtime-hours"
                            className="text-xs font-medium text-text-secondary"
                          >
                            加班小时数
                          </label>
                          <input
                            id="overtime-hours"
                            type="number"
                            min="0.5"
                            max="24"
                            step="0.5"
                            value={overtimeForm.hours}
                            onChange={(e) =>
                              setOvertimeForm((f) => ({ ...f, hours: e.target.value }))
                            }
                            className={fieldCls}
                          />
                          <div className="flex flex-wrap gap-1.5" aria-label="加班小时快捷选项">
                            {overtimeQuickHours.map((quickHours) => (
                              <button
                                key={quickHours}
                                type="button"
                                onClick={() =>
                                  setOvertimeForm((f) => ({ ...f, hours: `${quickHours}` }))
                                }
                                className={cn(
                                  'rounded-lg border px-2.5 py-1.5 text-xs hover:bg-black/5',
                                  overtimeForm.hours === `${quickHours}`
                                    ? 'border-liquid-indigo bg-indigo-50 text-liquid-indigo'
                                    : 'border-black/10 bg-white text-text-secondary',
                                )}
                              >
                                {quickHours} 小时
                              </button>
                            ))}
                          </div>
                        </div>
                        <p className="text-xs text-text-secondary">
                          实际加班小时数会自动折算为调休余额，支持输入半小时。
                        </p>
                        <button
                          onClick={() => void submitOvertime()}
                          disabled={saving === 'overtime'}
                          className={btnPrimaryCls}
                        >
                          <Plus size={15} /> 新增加班
                        </button>
                      </div>
                    </Panel>

                    <Panel>
                      <SectionHeading title="导入休假" subtitle="模板字段：姓名、开始日期、结束日期、单位、类型" />
                      <div className="grid gap-2">
                        <p className="text-xs leading-5 text-text-secondary">
                          单位填写“全天 / 上午半天 / 下午半天”，类型填写“请假 / 调假 / 调休 / 年假 /
                          自动扣假”。
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={downloadImportTemplate} className={btnGhostCls}>
                            <FileSpreadsheet size={15} /> 下载模板
                          </button>
                          <button onClick={() => setImportOpen(true)} className={btnGhostCls}>
                            <Upload size={15} /> 导入 Excel
                          </button>
                        </div>
                      </div>
                    </Panel>

                    <Panel>
                      <SectionHeading title="报表" subtitle="个人休假明细报表与全员休假汇总统计表" />
                      <div className="grid gap-2">
                        <select
                          value={reportEmployeeId}
                          onChange={(e) => setReportEmployeeId(e.target.value)}
                          className={fieldCls}
                          aria-label="选择员工"
                        >
                          <option value="" disabled>
                            选择员工
                          </option>
                          {employees.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                              {employee.name}
                            </option>
                          ))}
                        </select>
                        <button onClick={downloadPersonalReport} className={btnGhostCls}>
                          <Download size={15} /> 导出个人明细
                        </button>
                        <button onClick={downloadSummaryReport} className={btnGhostCls}>
                          <Download size={15} /> 导出全员汇总
                        </button>
                      </div>
                    </Panel>
                  </>
                ) : null}
              </div>

              <Panel>
                <SectionHeading
                  title="员工假期设置"
                  subtitle="年假按入职周年累计，每满一年自动增加 5 天；调整输入单位为天（如 0.25），统计时长按 8 小时=1 天显示为 d/h"
                />
                <PaginatedList
                  key={`employees-${paginationResetKeys.employees}`}
                  items={filteredStats}
                >
                  {(pageItems) => (
                    <EmployeeSettingsTable
                      employees={filteredEmployees}
                      stats={pageItems}
                      isAdmin={isAdmin}
                      onSave={(id, patch) => void saveEmployeeSettings(id, patch)}
                      onDelete={(id, name) => void deleteEmployee(id, name)}
                    />
                  )}
                </PaginatedList>
              </Panel>
            </section>

            <section className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <Panel>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <SectionHeading title="休假记录" subtitle="搜索或筛选后显示匹配结果" />
                  {dateFilter ? (
                    <button
                      onClick={() => setDateFilter(null)}
                      className="inline-flex items-center gap-1 rounded-lg border border-black/10 px-2 py-1 text-xs text-text-secondary hover:bg-black/5"
                    >
                      <X size={12} /> 清除筛选
                    </button>
                  ) : null}
                </div>
                <PaginatedList
                  key={`leave-${paginationResetKeys.records}`}
                  items={filteredRecords}
                >
                  {(pageItems) => (
                    <RecordsTable
                      records={pageItems}
                      stats={stats}
                      isAdmin={isAdmin}
                      onEdit={setEditingLeave}
                      onDelete={(id) => void deleteLeave(id)}
                    />
                  )}
                </PaginatedList>
              </Panel>
              <Panel>
                <SectionHeading
                  title="加班明细"
                  subtitle="登记后会增加该员工调休余额，并显示到日历中"
                />
                <PaginatedList
                  key={`overtime-${paginationResetKeys.overtime}`}
                  items={holidayWorkRecords}
                >
                  {(pageItems) => (
                    <OvertimeTable
                      records={pageItems}
                      isAdmin={isAdmin}
                      onDelete={(id) => void deleteOvertime(id)}
                    />
                  )}
                </PaginatedList>
              </Panel>
            </section>

            <Panel>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <SectionHeading
                  title="备忘录"
                  subtitle="记录某人某天加班几小时，或其他需要备注的事情"
                />
                <input
                  type="month"
                  value={memoMonth}
                  onChange={(e) => setMemoMonth(e.target.value)}
                  className={fieldSmCls}
                  aria-label="备忘录月份"
                />
              </div>
              <section className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
                {isAdmin ? (
                  <MemoNewForm
                    key={memoMonth}
                    employees={employees}
                    defaultDate={`${memoMonth}-01`}
                    onSubmit={(employeeId, memoDate, content) =>
                      submitMemo(employeeId, memoDate, content)
                    }
                  />
                ) : null}
                <div className="grid content-start gap-3">
                  <PaginatedList key={`memos-${paginationResetKeys.memos}`} items={visibleMemos}>
                    {(pageItems) => (
                      <MemoList
                        memos={pageItems}
                        employees={employees}
                        isAdmin={isAdmin}
                        onSave={(id, patch) => void saveMemo(id, patch)}
                        onDelete={(id) => void deleteMemo(id)}
                      />
                    )}
                  </PaginatedList>
                </div>
              </section>
            </Panel>
          </div>
        ) : null}

        {view === 'maintenance' ? (
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <div className="grid gap-4">
              {isAdmin ? (
                <>
                  <Panel>
                    <SectionHeading
                      title="员工"
                      subtitle="先建员工，建完后到员工假期页维护假期额度"
                    />
                    <div className="grid gap-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                        <UserPlus size={15} /> 新增员工
                      </div>
                      <input
                        value={employeeForm.name}
                        onChange={(e) =>
                          setEmployeeForm((f) => ({ ...f, name: e.target.value }))
                        }
                        placeholder="员工姓名"
                        className={fieldCls}
                      />
                      <input
                        type="date"
                        value={employeeForm.hireDate}
                        onChange={(e) =>
                          setEmployeeForm((f) => ({ ...f, hireDate: e.target.value }))
                        }
                        className={fieldCls}
                        aria-label="入职日期"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          step="0.0625"
                          value={employeeForm.annualAdjustment}
                          onChange={(e) =>
                            setEmployeeForm((f) => ({ ...f, annualAdjustment: e.target.value }))
                          }
                          placeholder="年假调整（天）"
                          className={fieldCls}
                        />
                        <input
                          type="number"
                          step="0.0625"
                          value={employeeForm.compAdjustment}
                          onChange={(e) =>
                            setEmployeeForm((f) => ({ ...f, compAdjustment: e.target.value }))
                          }
                          placeholder="调休调整（天）"
                          className={fieldCls}
                        />
                      </div>
                      <button
                        onClick={() => void submitEmployee()}
                        disabled={saving === 'employee'}
                        className={btnPrimaryCls}
                      >
                        <Plus size={15} /> 新增员工
                      </button>
                    </div>
                  </Panel>

                  <Panel>
                    <SectionHeading
                      title="节假日同步"
                      subtitle="同步中国大陆及香港假期，也可手动维护特殊日期"
                    />
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs leading-5 text-indigo-700">
                          香港 1823 官方 iCal；大陆法定节假日调休补班 iCal。
                        </p>
                        <button
                          onClick={() => void syncHolidays()}
                          disabled={saving === 'sync'}
                          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-liquid-indigo px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                        >
                          <CalendarDays size={14} /> 同步
                        </button>
                      </div>
                      {syncResult ? (
                        <p className="mt-2 text-xs text-indigo-700">
                          同步完成：新增 {syncResult.added} 条，更新 {syncResult.updated} 条
                          {syncResult.failed.length > 0
                            ? `，失败 ${syncResult.failed.length} 项`
                            : ''}
                        </p>
                      ) : null}
                      {syncResult && syncResult.failed.length > 0 ? (
                        <ul className="mt-1 space-y-0.5 text-xs text-red-600">
                          {syncResult.failed.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </Panel>

                  <Panel>
                    <SectionHeading
                      title="手动假期"
                      subtitle="用于公司特殊放假、补班或临时调整"
                    />
                    <div className="grid gap-2">
                      <input
                        type="date"
                        value={holidayForm.date}
                        onChange={(e) =>
                          setHolidayForm((f) => ({ ...f, date: e.target.value }))
                        }
                        className={fieldCls}
                        aria-label="假期日期"
                      />
                      <select
                        value={holidayForm.region}
                        onChange={(e) =>
                          setHolidayForm((f) => ({
                            ...f,
                            region: e.target.value as HolidayRegion,
                          }))
                        }
                        className={fieldCls}
                        aria-label="假期地区"
                      >
                        <option value="mainland">大陆假日</option>
                        <option value="hongkong">香港假日</option>
                        <option value="both">两地同休</option>
                        <option value="manual">手动假日</option>
                      </select>
                      <input
                        value={holidayForm.name}
                        onChange={(e) =>
                          setHolidayForm((f) => ({ ...f, name: e.target.value }))
                        }
                        placeholder="假期名称"
                        className={fieldCls}
                      />
                      <label className="flex items-center gap-2 text-sm text-text-primary">
                        <input
                          type="checkbox"
                          checked={holidayForm.isWorkday}
                          onChange={(e) =>
                            setHolidayForm((f) => ({ ...f, isWorkday: e.target.checked }))
                          }
                          className="size-4"
                        />
                        设为补班日/特殊上班日
                      </label>
                      <button
                        onClick={() => void submitHoliday()}
                        disabled={saving === 'holiday'}
                        className={btnPrimaryCls}
                      >
                        <Plus size={15} /> 新增假期
                      </button>
                    </div>
                  </Panel>
                </>
              ) : null}

              <Panel>
                <SectionHeading title="员工列表" subtitle="当前台账员工" />
                <div className="grid gap-2">
                  {employees.map((employee) => (
                    <div
                      key={employee.id}
                      className="rounded-lg bg-black/[0.03] px-3 py-2.5 text-sm hover:bg-black/[0.05]"
                    >
                      <p className="font-medium text-text-primary">{employee.name}</p>
                      <p className="text-xs text-text-secondary">
                        入职日期：{employee.hireDate ?? '未设置'}
                      </p>
                    </div>
                  ))}
                  {employees.length === 0 ? <EmptyState text="暂无员工" /> : null}
                </div>
              </Panel>

              <UpcomingHolidaysPanel
                holidays={visibleMonthHolidays}
                isAdmin={isAdmin}
                onDeleteHoliday={(id) => void deleteHoliday(id)}
              />
            </div>

            <div className="grid gap-4">
              <Panel>
                <SectionHeading title="操作日志" subtitle="最新在前" />
                {logsLoading ? (
                  <p className="py-6 text-center text-sm text-text-secondary">加载中…</p>
                ) : logs.length === 0 ? (
                  <EmptyState text="暂无操作日志" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] border-collapse text-[13px]">
                      <thead>
                        <tr className="border-b border-black/10 bg-black/[0.03] text-left text-xs text-text-secondary">
                          <th className="py-2 pr-2 font-semibold">操作人</th>
                          <th className="py-2 pr-2 font-semibold">操作</th>
                          <th className="py-2 pr-2 font-semibold">对象</th>
                          <th className="py-2 pr-2 font-semibold">详情</th>
                          <th className="py-2 font-semibold">时间</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map((log) => (
                          <tr
                            key={log.id}
                            className="border-b border-black/5 hover:bg-black/[0.02]"
                          >
                            <td className="py-2 pr-2">{log.operator}</td>
                            <td className="py-2 pr-2">{log.action}</td>
                            <td className="py-2 pr-2">{log.targetType}</td>
                            <td className="py-2 pr-2 break-words">{log.detail}</td>
                            <td className="whitespace-nowrap py-2">
                              {formatDateTimeShanghai(log.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <Pagination
                  page={logPage}
                  totalItems={logsTotal}
                  totalPages={logTotalPages}
                  pageSize={LOG_PAGE_SIZE}
                  onPageChange={setLogPage}
                />
              </Panel>
            </div>
          </div>
        ) : null}
      </div>

      {calendarExpanded ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0f172a]/55 p-3 backdrop-blur-sm md:p-6">
          <div className="mx-auto max-w-[1500px] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl">
            <CalendarHeader
              monthCursor={monthCursor}
              selectedDate={selectedDate}
              selectedHolidayLabels={selectedHolidayLabels}
              expanded
              onSetMonthCursor={setMonthCursor}
              onToggleExpanded={() => setCalendarExpanded(false)}
            />
            <CalendarGrid
              cursor={monthCursor}
              expanded
              selectedDate={selectedDate}
              holidayMap={holidayMap}
              eventMap={calendarEventMap}
              onSelect={handleSelectDate}
            />
            <div className="border-t border-black/5 bg-black/[0.02] p-4">
              <CalendarSidePanel
                selectedDate={selectedDate}
                selectedDateEvents={selectedDateEvents}
                upcomingHolidays={visibleMonthHolidays}
                isAdmin={isAdmin}
                onDeleteHoliday={(id) => void deleteHoliday(id)}
              />
            </div>
          </div>
        </div>
      ) : null}

      {editingLeave ? (
        <EditLeaveModal
          key={editingLeave.id}
          record={editingLeave}
          employees={employees}
          onClose={() => setEditingLeave(null)}
          onSave={(patch) => void saveLeaveEdit(editingLeave.id, patch)}
        />
      ) : null}

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="导入休假" size="lg">
        <div className="space-y-4">
          <p className="text-xs leading-5 text-text-secondary">
            模板字段：姓名、开始日期、结束日期、单位、类型。单位填写“全天 / 上午半天 /
            下午半天”，类型填写“请假 / 调假 / 调休 / 年假 / 自动扣假”。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={downloadImportTemplate} className={btnGhostCls}>
              <FileSpreadsheet size={15} /> 下载模板
            </button>
            <label className={cn(btnGhostCls, 'cursor-pointer')}>
              <Upload size={15} /> 选择 Excel 文件
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImportFile(file);
                  e.target.value = '';
                }}
              />
            </label>
            {importFileName ? (
              <span className="text-xs text-text-secondary">{importFileName}</span>
            ) : null}
          </div>
          {importRows.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-text-primary">
                预览：共 {importRows.length} 行，其中有效{' '}
                {importRows.filter((r) => !r.problem).length} 行，有问题{' '}
                {importRows.filter((r) => r.problem).length} 行
              </p>
              <div className="max-h-80 overflow-auto rounded-lg border border-black/10">
                <table className="w-full min-w-[560px] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-black/10 bg-black/[0.03] text-left text-xs text-text-secondary">
                      <th className="px-2 py-2 font-semibold">行号</th>
                      <th className="px-2 py-2 font-semibold">姓名</th>
                      <th className="px-2 py-2 font-semibold">开始日期</th>
                      <th className="px-2 py-2 font-semibold">结束日期</th>
                      <th className="px-2 py-2 font-semibold">单位</th>
                      <th className="px-2 py-2 font-semibold">类型</th>
                      <th className="px-2 py-2 font-semibold">原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((row) => (
                      <tr
                        key={row.row}
                        className={cn(
                          'border-b border-black/5',
                          row.problem ? 'bg-red-50/60' : '',
                        )}
                      >
                        <td className="px-2 py-1.5">{row.row}</td>
                        <td className="px-2 py-1.5">{row.name}</td>
                        <td className="px-2 py-1.5">{row.startDate}</td>
                        <td className="px-2 py-1.5">{row.endDate}</td>
                        <td className="px-2 py-1.5">
                          {row.unit ? leaveUnitLabels[row.unit as LeaveUnit] ?? row.unit : ''}
                        </td>
                        <td className="px-2 py-1.5">
                          {row.type === 'auto'
                            ? '自动扣假'
                            : row.type
                              ? leaveTypeLabels[row.type as LeaveType] ?? row.type
                              : ''}
                        </td>
                        <td className="px-2 py-1.5 text-red-600">{row.problem ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          {importResult ? (
            <div className="space-y-2 rounded-lg border border-black/10 bg-black/[0.02] p-3">
              <p className="text-sm font-medium text-text-primary">
                导入结果：成功导入 {importResult.inserted} 条
              </p>
              {importResult.failed.length > 0 ? (
                <div>
                  <p className="text-xs text-text-secondary">失败行：</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-red-600">
                    {importResult.failed.map((item) => (
                      <li key={item.row}>
                        第 {item.row} 行：{item.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <button onClick={() => setImportOpen(false)} className={btnGhostCls}>
              关闭
            </button>
            <button
              onClick={() => void confirmImport()}
              disabled={importing || importRows.filter((r) => !r.problem).length === 0}
              className={btnPrimaryCls}
            >
              确认导入
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function parseExcelDate(value: unknown): string | null {
  if (value === '' || value === null || value === undefined) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toDateKey(value);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
    return null;
  }
  if (typeof value === 'string') {
    const s = value.trim().replace(/\//g, '-');
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (!m) return null;
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  return null;
}

function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'min-w-0 rounded-2xl border border-black/10 bg-white p-4 shadow-sm sm:p-5',
        className,
      )}
    >
      {children}
    </section>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-[15px] font-semibold leading-5 text-text-primary">{title}</h3>
      {subtitle ? <p className="mt-1 text-[13px] leading-5 text-text-secondary">{subtitle}</p> : null}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-black/10 bg-black/[0.02] px-4 py-7 text-center text-[13px] text-text-secondary">
      {text}
    </p>
  );
}

function PaginatedList<T>({
  items,
  children,
}: {
  items: T[];
  children: (items: T[]) => ReactNode;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visibleItems = items.slice(start, start + PAGE_SIZE);

  return (
    <>
      {children(visibleItems)}
      <Pagination
        page={currentPage}
        totalItems={items.length}
        totalPages={totalPages}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
    </>
  );
}

function Pagination({
  page,
  totalItems,
  totalPages,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalItems: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-black/5 pt-3">
      <p className="text-xs text-text-secondary">
        共 {totalItems} 条，每页 {pageSize} 条
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-black/10 px-2.5 text-xs font-medium text-text-primary hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="上一页"
        >
          <ChevronLeft size={14} />
          上一页
        </button>
        <span className="min-w-20 text-center text-xs text-text-secondary">
          第 {page} / {totalPages} 页
        </span>
        <button
          type="button"
          disabled={page === totalPages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-black/10 px-2.5 text-xs font-medium text-text-primary hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="下一页"
        >
          下一页
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function EventPill({ event, compact }: { event: CalendarEvent; compact?: boolean }) {
  return (
    <span
      className={cn(
        'block truncate rounded px-2 py-1 text-xs font-medium',
        compact && 'px-1.5 py-0.5 text-[11px]',
        event.tone === 'annual' && 'bg-[#e9d7fe] text-[#5925dc]',
        event.tone === 'comp' && 'bg-[#dcfae6] text-[#067647]',
        event.tone === 'personal' && 'bg-[#fee4e2] text-[#b42318]',
        event.tone === 'adjusted' && 'bg-[#fef0c7] text-[#93370d]',
        event.tone === 'work' && 'bg-[#d1e9ff] text-[#175cd3]',
      )}
    >
      {event.label}
    </span>
  );
}

function CalendarHeader({
  monthCursor,
  selectedDate,
  selectedHolidayLabels,
  expanded,
  onSetMonthCursor,
  onToggleExpanded,
}: {
  monthCursor: Date;
  selectedDate: string;
  selectedHolidayLabels: Holiday[];
  expanded: boolean;
  onSetMonthCursor: React.Dispatch<React.SetStateAction<Date>>;
  onToggleExpanded: () => void;
}) {
  const monthLabel = `${monthCursor.getFullYear()} 年 ${monthCursor.getMonth() + 1} 月`;
  const year = monthCursor.getFullYear();
  const years: number[] = [];
  for (let y = year - 6; y <= year + 6; y++) years.push(y);

  return (
    <div className="border-b border-black/5 bg-black/[0.02] px-3 py-3 sm:px-4 sm:py-4 md:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-text-primary">假期日历</h3>
          <p className="mt-1 text-[13px] text-text-secondary">
            {selectedDate}
            {selectedHolidayLabels.length > 0
              ? ` · ${selectedHolidayLabels.map((item) => item.name).join('、')}`
              : ' · 工作日口径按两地假期并集'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            title="上月"
            aria-label="上月"
            onClick={() =>
              onSetMonthCursor((cursor) => new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
            }
            className="inline-flex size-9 items-center justify-center rounded-lg border border-black/10 bg-white text-text-primary hover:bg-black/5"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-28 rounded-lg bg-black/5 px-3 py-2 text-center text-sm font-semibold text-text-primary">
            {monthLabel}
          </span>
          <button
            type="button"
            title="下月"
            aria-label="下月"
            onClick={() =>
              onSetMonthCursor((cursor) => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
            }
            className="inline-flex size-9 items-center justify-center rounded-lg border border-black/10 bg-white text-text-primary hover:bg-black/5"
          >
            <ChevronRight size={18} />
          </button>
          <select
            value={year}
            onChange={(e) =>
              onSetMonthCursor(new Date(Number(e.target.value), monthCursor.getMonth(), 1))
            }
            aria-label="选择年份"
            className={fieldSmCls}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y} 年
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label={expanded ? '收起日历' : '放大日历'}
            onClick={onToggleExpanded}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/10 bg-white px-2.5 text-sm text-text-primary hover:bg-black/5 sm:px-3"
          >
            {expanded ? <Minimize2 size={16} /> : <Expand size={16} />}
            <span className="hidden sm:inline">{expanded ? '收起日历' : '放大日历'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function CalendarGrid({
  cursor,
  expanded,
  selectedDate,
  holidayMap,
  eventMap,
  onSelect,
}: {
  cursor: Date;
  expanded: boolean;
  selectedDate: string;
  holidayMap: Map<string, Holiday[]>;
  eventMap: Map<string, CalendarEvent[]>;
  onSelect: (date: string) => void;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());

  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });

  return (
    <div className="bg-white p-2 sm:p-3 md:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold tracking-[-0.015em] text-text-primary sm:text-lg">
          {year} 年 {month + 1} 月
        </h3>
        <button
          type="button"
          onClick={() => onSelect(todayShanghai())}
          className="rounded-lg border border-black/10 px-3 py-1.5 text-sm text-text-primary hover:bg-black/5"
        >
          今日
        </button>
      </div>
      <div className="grid grid-cols-7 rounded-t-lg bg-black/[0.03] text-center text-[10px] font-semibold tracking-[0.04em] text-text-secondary sm:text-[11px]">
        {['日', '一', '二', '三', '四', '五', '六'].map((item) => (
          <div key={item} className="py-2">
            {item}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-b-lg border-l border-t border-black/10">
        {cells.map((date) => {
          const key = toDateKey(date);
          const holidays = holidayMap.get(key) ?? [];
          const events = eventMap.get(key) ?? [];
          const isCurrentMonth = date.getMonth() === month;
          const isSelected = key === selectedDate;
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const nonWorkdayHolidays = holidays.filter((holiday) => !holiday.isWorkday);
          const nonWorkdayHoliday = nonWorkdayHolidays[0];
          const workdayOverride = holidays.find((holiday) => holiday.isWorkday);
          const nonWorkdayRegions = new Set(nonWorkdayHolidays.map((holiday) => holiday.region));
          const hasTwoRegions =
            nonWorkdayRegions.has('mainland') && nonWorkdayRegions.has('hongkong');
          const region = hasTwoRegions ? 'both' : nonWorkdayHoliday?.region;
          const holidayLabels = (() => {
            if (!nonWorkdayHolidays.length) return [];
            const uniqueNames = [...new Set(nonWorkdayHolidays.map((holiday) => holiday.name))];
            if (region === 'both' || nonWorkdayHolidays.some((holiday) => holiday.region === 'both')) {
              return [`两地同休-${uniqueNames.join('、')}`];
            }
            return nonWorkdayHolidays.map(
              (holiday) => `${holidayRegionLabels[holiday.region]}-${holiday.name}`,
            );
          })();

          return (
            <button
              key={key}
              type="button"
              title={[...holidays.map((holiday) => holiday.name), ...events.map((event) => event.label)].join('、')}
              onClick={() => onSelect(key)}
              className={cn(
                'group min-w-0 border-b border-r border-black/10 bg-white p-1.5 text-left align-top transition-colors hover:bg-black/[0.02] sm:p-2',
                expanded ? 'min-h-28 sm:min-h-36' : 'min-h-[4.25rem] sm:min-h-24 lg:min-h-28',
                isSelected && 'relative z-10 ring-2 ring-[#1677ff]',
                !isCurrentMonth && 'bg-black/[0.03] text-text-secondary',
                isWeekend && !nonWorkdayHoliday && 'bg-[#f4f6f8]',
                workdayOverride && !nonWorkdayHoliday && 'bg-[#ecfdf3]',
                region === 'mainland' && 'bg-[#fff1f3]',
                region === 'hongkong' && 'bg-[#eff8ff]',
                region === 'both' && 'bg-[#f4f3ff]',
                region === 'manual' && 'bg-[#f0fdf4]',
              )}
            >
              <div className="mb-1 flex items-start justify-between gap-1">
                <span className="text-xs font-semibold sm:text-sm">{date.getDate()}</span>
                {workdayOverride && !nonWorkdayHoliday ? (
                  <span className="rounded bg-[#d1fadf] px-1.5 py-0.5 text-[10px] text-[#067647]">补班</span>
                ) : null}
              </div>
              {nonWorkdayHoliday ? (
                <div className="mb-1 space-y-1">
                  {(expanded
                    ? holidayLabels
                    : [region === 'both' ? '两地同休' : holidayRegionLabels[nonWorkdayHoliday.region]]
                  ).map((label) => (
                    <span
                      key={label}
                      className={cn(
                        'block rounded px-1 py-0.5 text-[10px] font-medium leading-4 sm:px-1.5 sm:text-[11px]',
                        expanded ? 'whitespace-normal break-words' : 'truncate',
                        region === 'mainland' && 'bg-[#fee4e2] text-[#b42318]',
                        region === 'hongkong' && 'bg-[#d1e9ff] text-[#175cd3]',
                        region === 'both' && 'bg-[#e9d7fe] text-[#5925dc]',
                        region === 'manual' && 'bg-[#dcfae6] text-[#067647]',
                      )}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="space-y-1">
                {events.slice(0, expanded ? 5 : 3).map((event) => (
                  <EventPill key={event.id} event={event} compact />
                ))}
                {events.length > (expanded ? 5 : 3) ? (
                  <span className="block text-[11px] text-text-secondary">
                    +{events.length - (expanded ? 5 : 3)} 条
                  </span>
                ) : null}
              </div>
              {!expanded && events.length > 0 ? (
                <span className="mt-1 block text-[10px] font-medium text-text-secondary sm:hidden">
                  {events.length} 条
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CalendarSidePanel({
  selectedDate,
  selectedDateEvents,
  upcomingHolidays,
  isAdmin,
  onDeleteHoliday,
}: {
  selectedDate: string;
  selectedDateEvents: CalendarEvent[];
  upcomingHolidays: Holiday[];
  isAdmin: boolean;
  onDeleteHoliday: (id: number) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-1">
      <Panel>
        <SectionHeading title="当日动态" subtitle={selectedDate} />
        <div className="space-y-2">
          {selectedDateEvents.map((event) => (
            <EventPill key={event.id} event={event} />
          ))}
          {selectedDateEvents.length === 0 ? (
            <EmptyState text="当天暂无员工休假或加班登记" />
          ) : null}
        </div>
      </Panel>
      <UpcomingHolidaysPanel
        holidays={upcomingHolidays}
        isAdmin={isAdmin}
        onDeleteHoliday={onDeleteHoliday}
      />
    </div>
  );
}

function UpcomingHolidaysPanel({
  holidays,
  isAdmin,
  onDeleteHoliday,
}: {
  holidays: Holiday[];
  isAdmin: boolean;
  onDeleteHoliday: (id: number) => void;
}) {
  return (
    <Panel>
      <SectionHeading title="本月假期" subtitle="跟随当前日历月份显示" />
      <div className="space-y-2">
        {holidays.map((holiday) => (
          <div
            key={holiday.id}
            className="flex items-center justify-between gap-2 rounded-lg bg-black/[0.03] px-3 py-2.5 text-sm hover:bg-black/[0.05]"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-text-primary">{holiday.name}</p>
              <p className="text-xs text-text-secondary">
                {holiday.date} · {holiday.isWorkday ? '补班日' : holidayRegionLabels[holiday.region]}
              </p>
            </div>
            {isAdmin ? (
              <button
                title="删除假期"
                onClick={() => onDeleteHoliday(holiday.id)}
                className={btnDangerIconCls}
              >
                <Trash2 size={15} />
              </button>
            ) : null}
          </div>
        ))}
        {holidays.length === 0 ? <EmptyState text="本月暂无假期配置" /> : null}
      </div>
    </Panel>
  );
}

function EmployeeFocus({ stat }: { stat: EmployeeStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-3 sm:p-4 md:grid-cols-6">
      <div>
        <p className="text-xs font-medium text-indigo-700">当前员工</p>
        <p className="font-semibold text-text-primary">{stat.employeeName}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-indigo-700">本月已休</p>
        <p className="font-semibold text-text-primary">{formatDaysAsDuration(stat.monthlyUsed)}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-indigo-700">本年已休</p>
        <p className="font-semibold text-text-primary">{formatDaysAsDuration(stat.yearlyUsed)}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-indigo-700">年假余额</p>
        <p className="font-semibold text-text-primary">{formatDaysAsDuration(stat.annualBalance)}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-indigo-700">调休余额</p>
        <p className="font-semibold text-text-primary">{formatDaysAsDuration(stat.compBalance)}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-indigo-700">总可用</p>
        <p className="font-semibold text-text-primary">{formatDaysAsDuration(stat.totalBalance)}</p>
      </div>
    </div>
  );
}

function RecordsTable({
  records,
  stats,
  isAdmin,
  onEdit,
  onDelete,
}: {
  records: LeaveRecord[];
  stats: EmployeeStats[];
  isAdmin: boolean;
  onEdit: (record: LeaveRecord) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-black/10 bg-black/[0.03] text-left text-xs text-text-secondary">
            <th className="py-2.5 pr-2 font-semibold">员工</th>
            <th className="py-2.5 pr-2 font-semibold">类型</th>
            <th className="py-2.5 pr-2 font-semibold">单位</th>
            <th className="py-2.5 pr-2 font-semibold">开始</th>
            <th className="py-2.5 pr-2 font-semibold">结束</th>
            <th className="py-2.5 pr-2 font-semibold">时长</th>
            <th className="py-2.5 pr-2 font-semibold">年假余额</th>
            <th className="py-2.5 pr-2 font-semibold">调休余额</th>
            {isAdmin ? (
              <th className="sticky right-0 bg-black/[0.03] py-2.5 pl-3 font-semibold">操作</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const stat = stats.find((item) => item.employeeId === record.employeeId);
            return (
              <tr key={record.id} className="border-b border-black/5 hover:bg-black/[0.02]">
                <td className="py-2.5 pr-2">{record.employeeName}</td>
                <td className="py-2.5 pr-2">{leaveTypeLabels[record.type]}</td>
                <td className="py-2.5 pr-2">{leaveUnitLabels[record.unit]}</td>
                <td className="py-2.5 pr-2">{record.startDate}</td>
                <td className="py-2.5 pr-2">{record.endDate}</td>
                <td className="py-2.5 pr-2">{formatDaysAsDuration(record.days)}</td>
                <td className="py-2.5 pr-2">{stat ? formatDaysAsDuration(stat.annualBalance) : '-'}</td>
                <td className="py-2.5 pr-2">{stat ? formatDaysAsDuration(stat.compBalance) : '-'}</td>
                {isAdmin ? (
                  <td className="sticky right-0 bg-white py-2.5 pl-3">
                    <div className="flex gap-1.5">
                      <button title="编辑" aria-label="编辑休假记录" onClick={() => onEdit(record)} className={btnIconCls}>
                        <Pencil size={15} />
                      </button>
                      <button title="删除" aria-label="删除休假记录" onClick={() => onDelete(record.id)} className={btnDangerIconCls}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
          {records.length === 0 ? (
            <tr>
              <td className="py-8 text-center text-text-secondary" colSpan={isAdmin ? 9 : 8}>
                暂无匹配休假记录
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function OvertimeTable({
  records,
  isAdmin,
  onDelete,
}: {
  records: HolidayWorkRecord[];
  isAdmin: boolean;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-black/10 bg-black/[0.03] text-left text-xs text-text-secondary">
            <th className="py-2.5 pr-2 font-semibold">员工</th>
            <th className="py-2.5 pr-2 font-semibold">加班日期</th>
            <th className="py-2.5 pr-2 font-semibold">加班小时</th>
            <th className="py-2.5 pr-2 font-semibold">折算调休</th>
            {isAdmin ? <th className="py-2.5 font-semibold">操作</th> : null}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id} className="border-b border-black/5 hover:bg-black/[0.02]">
              <td className="py-2.5 pr-2">{record.employeeName}</td>
              <td className="py-2.5 pr-2">{record.workDate}</td>
              <td className="py-2.5 pr-2">{formatNumber(record.hours)} 小时</td>
              <td className="py-2.5 pr-2">{formatDaysAsDuration(record.days)}</td>
              {isAdmin ? (
                <td className="py-2.5">
                  <button
                    type="button"
                    title="删除加班登记"
                    aria-label={`删除 ${record.employeeName} ${record.workDate} 的加班登记`}
                    onClick={() => onDelete(record.id)}
                    className={btnDangerIconCls}
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
          {records.length === 0 ? (
            <tr>
              <td className="py-8 text-center text-text-secondary" colSpan={isAdmin ? 5 : 4}>
                暂无加班登记
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

interface SettingsDraft {
  name: string;
  hireDate: string;
  annualAdjustment: string;
  compAdjustment: string;
}

function EmployeeSettingsTable({
  employees,
  stats,
  isAdmin,
  onSave,
  onDelete,
}: {
  employees: Employee[];
  stats: EmployeeStats[];
  isAdmin: boolean;
  onSave: (
    id: number,
    patch: { name: string; hireDate: string | null; annualAdjustment: number; compAdjustment: number },
  ) => void;
  onDelete: (id: number, name: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<number, SettingsDraft>>({});

  const draftFor = (stat: EmployeeStats): SettingsDraft => {
    const employee = employees.find((e) => e.id === stat.employeeId);
    return (
      drafts[stat.employeeId] ?? {
        name: employee?.name ?? stat.employeeName,
        hireDate: employee?.hireDate ?? '',
        annualAdjustment: String(stat.annualAdjustment),
        compAdjustment: String(stat.compAdjustment),
      }
    );
  };

  const setDraft = (id: number, patch: Partial<SettingsDraft>) => {
    setDrafts((prev) => {
      const stat = stats.find((s) => s.employeeId === id);
      const employee = employees.find((e) => e.id === id);
      const base: SettingsDraft = prev[id] ?? {
        name: employee?.name ?? stat?.employeeName ?? '',
        hireDate: employee?.hireDate ?? '',
        annualAdjustment: String(stat?.annualAdjustment ?? 0),
        compAdjustment: String(stat?.compAdjustment ?? 0),
      };
      return { ...prev, [id]: { ...base, ...patch } };
    });
  };

  const save = (stat: EmployeeStats) => {
    const draft = draftFor(stat);
    onSave(stat.employeeId, {
      name: draft.name.trim(),
      hireDate: draft.hireDate || null,
      annualAdjustment: Number(draft.annualAdjustment) || 0,
      compAdjustment: Number(draft.compAdjustment) || 0,
    });
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[stat.employeeId];
      return next;
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-black/10 bg-black/[0.03] text-left text-xs text-text-secondary">
            <th className="py-2 pr-2 font-semibold">员工</th>
            <th className="py-2 pr-2 font-semibold">入职日期</th>
            <th className="py-2 pr-2 font-semibold">年假调整（天）</th>
            <th className="py-2 pr-2 font-semibold">累计新增</th>
            <th className="py-2 pr-2 font-semibold">累计已用</th>
            <th className="py-2 pr-2 font-semibold">年假余额</th>
            <th className="py-2 pr-2 font-semibold">调休调整（天）</th>
            <th className="py-2 pr-2 font-semibold">调休产生</th>
            <th className="py-2 pr-2 font-semibold">调休已用</th>
            <th className="py-2 pr-2 font-semibold">调休余额</th>
            {isAdmin ? <th className="py-2 font-semibold">操作</th> : null}
          </tr>
        </thead>
        <tbody>
          {stats.map((stat) => {
            const draft = draftFor(stat);
            return (
              <tr key={stat.employeeId} className="border-b border-black/5 hover:bg-black/[0.02]">
                <td className="py-2 pr-2">
                  {isAdmin ? (
                    <input
                      value={draft.name}
                      onChange={(e) => setDraft(stat.employeeId, { name: e.target.value })}
                      className={cn(fieldTblCls, 'h-8 w-28')}
                      aria-label="员工姓名"
                    />
                  ) : (
                    stat.employeeName
                  )}
                </td>
                <td className="py-2 pr-2">
                  {isAdmin ? (
                    <input
                      type="date"
                      value={draft.hireDate}
                      onChange={(e) => setDraft(stat.employeeId, { hireDate: e.target.value })}
                      className={cn(fieldTblCls, 'h-8 w-36')}
                      aria-label="入职日期"
                    />
                  ) : (
                    employees.find((e) => e.id === stat.employeeId)?.hireDate ?? '未设置'
                  )}
                </td>
                <td className="py-2 pr-2">
                  {isAdmin ? (
                    <input
                      type="number"
                      step="0.0625"
                      value={draft.annualAdjustment}
                      onChange={(e) =>
                        setDraft(stat.employeeId, { annualAdjustment: e.target.value })
                      }
                      className={cn(fieldTblCls, 'h-8 w-24')}
                      aria-label="年假调整"
                    />
                  ) : (
                    formatNumber(stat.annualAdjustment)
                  )}
                </td>
                <td className="py-2 pr-2">{formatDaysAsDuration(stat.annualGranted)}</td>
                <td className="py-2 pr-2">{formatDaysAsDuration(stat.annualUsed)}</td>
                <td className="py-2 pr-2 font-semibold">{formatDaysAsDuration(stat.annualBalance)}</td>
                <td className="py-2 pr-2">
                  {isAdmin ? (
                    <input
                      type="number"
                      step="0.0625"
                      value={draft.compAdjustment}
                      onChange={(e) =>
                        setDraft(stat.employeeId, { compAdjustment: e.target.value })
                      }
                      className={cn(fieldTblCls, 'h-8 w-24')}
                      aria-label="调休调整"
                    />
                  ) : (
                    formatNumber(stat.compAdjustment)
                  )}
                </td>
                <td className="py-2 pr-2">{formatDaysAsDuration(stat.compEarned)}</td>
                <td className="py-2 pr-2">{formatDaysAsDuration(stat.compUsed)}</td>
                <td className="py-2 pr-2 font-semibold">{formatDaysAsDuration(stat.compBalance)}</td>
                {isAdmin ? (
                  <td className="py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => save(stat)}
                        className="rounded-lg border border-black/10 px-2.5 py-1.5 text-xs hover:bg-black/5"
                      >
                        保存
                      </button>
                      <button
                        onClick={() => onDelete(stat.employeeId, stat.employeeName)}
                        className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
          {stats.length === 0 ? (
            <tr>
              <td className="py-8 text-center text-text-secondary" colSpan={isAdmin ? 11 : 10}>
                暂无员工
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function MemoNewForm({
  employees,
  defaultDate,
  onSubmit,
}: {
  employees: Employee[];
  defaultDate: string;
  onSubmit: (employeeId: string, memoDate: string, content: string) => Promise<boolean>;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [memoDate, setMemoDate] = useState(defaultDate);
  const [content, setContent] = useState('');

  return (
    <div className="grid content-start gap-2 rounded-lg border border-black/10 bg-black/[0.02] p-4">
      <select
        value={employeeId}
        onChange={(e) => setEmployeeId(e.target.value)}
        className={fieldCls}
        aria-label="选择员工"
      >
        <option value="" disabled>
          选择员工
        </option>
        {employees.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={memoDate}
        onChange={(e) => setMemoDate(e.target.value)}
        className={fieldCls}
        aria-label="备忘日期"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={5}
        placeholder="例如：Oscar 2026/06/23 加班 2 小时；或记录其他事项"
        className={cn(fieldCls, 'h-auto min-h-28 py-2')}
      />
      <button
        onClick={() => {
          void onSubmit(employeeId, memoDate, content).then((ok) => {
            if (ok) setContent('');
          });
        }}
        className={btnPrimaryCls}
      >
        <Plus size={15} /> 新增备忘
      </button>
    </div>
  );
}

function MemoList({
  memos,
  employees,
  isAdmin,
  onSave,
  onDelete,
}: {
  memos: Memo[];
  employees: Employee[];
  isAdmin: boolean;
  onSave: (id: number, patch: { employeeId: number; memoDate: string; content: string }) => void;
  onDelete: (id: number) => void;
}) {
  if (memos.length === 0) return <EmptyState text="本月暂无备忘录" />;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {memos.map((memo) =>
        isAdmin ? (
          <MemoCard
            key={memo.id}
            memo={memo}
            employees={employees}
            onSave={onSave}
            onDelete={onDelete}
          />
        ) : (
          <div key={memo.id} className="grid gap-2 rounded-lg border border-black/10 bg-white p-4">
            <p className="text-xs text-text-secondary">
              {memo.employeeName} · {memo.memoDate}
            </p>
            <p className="whitespace-pre-wrap text-sm text-text-primary">{memo.content}</p>
          </div>
        ),
      )}
    </div>
  );
}

function MemoCard({
  memo,
  employees,
  onSave,
  onDelete,
}: {
  memo: Memo;
  employees: Employee[];
  onSave: (id: number, patch: { employeeId: number; memoDate: string; content: string }) => void;
  onDelete: (id: number) => void;
}) {
  const [employeeId, setEmployeeId] = useState(String(memo.employeeId));
  const [memoDate, setMemoDate] = useState(memo.memoDate);
  const [content, setContent] = useState(memo.content);

  useEffect(() => {
    setEmployeeId(String(memo.employeeId));
    setMemoDate(memo.memoDate);
    setContent(memo.content);
  }, [memo]);

  return (
    <div className="grid gap-2 rounded-lg border border-black/10 bg-white p-4 hover:border-black/20">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
        <select
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          className={fieldCls}
          aria-label="选择员工"
        >
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={memoDate}
          onChange={(e) => setMemoDate(e.target.value)}
          className={fieldCls}
          aria-label="备忘日期"
        />
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={5}
        className={cn(fieldCls, 'h-auto min-h-28 py-2')}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs text-text-secondary">
          {memo.employeeName} · 更新于 {memo.updatedAt.slice(0, 10)}
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() =>
              onSave(memo.id, {
                employeeId: Number(employeeId),
                memoDate,
                content,
              })
            }
            className="rounded-lg border border-black/10 px-2.5 py-1.5 text-xs hover:bg-black/5"
          >
            保存
          </button>
          <button
            onClick={() => onDelete(memo.id)}
            title="删除备忘"
            className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}

function EditLeaveModal({
  record,
  employees,
  onClose,
  onSave,
}: {
  record: LeaveRecord;
  employees: Employee[];
  onClose: () => void;
  onSave: (patch: {
    employeeId: number;
    type: LeaveType;
    unit: LeaveUnit;
    startDate: string;
    endDate: string;
  }) => void;
}) {
  const showToast = useUiStore((s) => s.showToast);
  const [employeeId, setEmployeeId] = useState(String(record.employeeId));
  const [type, setType] = useState<LeaveType>(record.type);
  const [unit, setUnit] = useState<LeaveUnit>(record.unit);
  const [startDate, setStartDate] = useState(record.startDate);
  const [endDate, setEndDate] = useState(record.endDate);

  const handleSave = () => {
    if (!employeeId) {
      showToast('请先选择员工', 'error');
      return;
    }
    if (!startDate || !endDate) {
      showToast('请先填写开始和结束日期', 'error');
      return;
    }
    onSave({ employeeId: Number(employeeId), type, unit, startDate, endDate });
  };

  return (
    <Modal open onClose={onClose} title="编辑休假记录" size="md">
      <div className="grid gap-2">
        <select
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          className={fieldCls}
          aria-label="选择员工"
        >
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as LeaveType)}
            className={fieldCls}
            aria-label="休假类型"
          >
            <option value="personal">请假</option>
            <option value="adjusted">调假</option>
            <option value="comp">调休</option>
            <option value="annual">年假</option>
          </select>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as LeaveUnit)}
            className={fieldCls}
            aria-label="休假单位"
          >
            <option value="full">全天</option>
            <option value="am">上午半天</option>
            <option value="pm">下午半天</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={fieldCls}
            aria-label="开始日期"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={fieldCls}
            aria-label="结束日期"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={btnGhostCls}>
            取消
          </button>
          <button onClick={handleSave} className={btnPrimaryCls}>
            保存
          </button>
        </div>
      </div>
    </Modal>
  );
}
