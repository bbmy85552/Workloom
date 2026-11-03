// 2dqy-oa 假期管理业务逻辑移植（来源：/Volumes/ssd-bob/code/2dqy-oa/lib/*）。
// 口径照搬来源，不得改动；唯一改动是「当年/当月/今天」一律按 Asia/Shanghai 取。
// 来源的共用写入密码机制已废弃：写入权限由 Workloom JWT + ADMIN 角色控制。

export const leaveTypes = ['personal', 'adjusted', 'comp', 'annual'] as const;
export type LeaveType = (typeof leaveTypes)[number];
export type LeaveTypeInput = LeaveType | 'auto';

export const leaveTypeLabels: Record<LeaveType, string> = {
  personal: '请假',
  adjusted: '调假',
  comp: '调休',
  annual: '年假',
};

export const leaveUnits = ['full', 'am', 'pm'] as const;
export type LeaveUnit = (typeof leaveUnits)[number];
export const leaveUnitLabels: Record<LeaveUnit, string> = {
  full: '全天',
  am: '上午半天',
  pm: '下午半天',
};

export const OVERTIME_HOURS_PER_COMP_DAY = 8;
export const overtimeQuickHours = [1, 2, 4, 8] as const;

export const holidayRegions = ['mainland', 'hongkong', 'both', 'manual'] as const;
export type HolidayRegion = (typeof holidayRegions)[number];
export const holidayRegionLabels: Record<HolidayRegion, string> = {
  mainland: '大陆假日',
  hongkong: '香港假日',
  both: '两地同休',
  manual: '手动假日',
};

export type Employee = {
  id: number;
  name: string;
  hireDate: string | null;
  annualAdjustment: number;
  compAdjustment: number;
  createdAt: string;
};

export type Holiday = {
  id: number;
  date: string;
  region: HolidayRegion;
  name: string;
  isWorkday: boolean;
  source: string;
};

export type LeaveRecord = {
  id: number;
  employeeId: number;
  employeeName: string;
  type: LeaveType;
  unit: LeaveUnit;
  startDate: string;
  endDate: string;
  days: number;
  createdAt: string;
};

export type HolidayWorkRecord = {
  id: number;
  employeeId: number;
  employeeName: string;
  workDate: string;
  hours: number;
  days: number;
  createdAt: string;
};

export type Memo = {
  id: number;
  employeeId: number;
  employeeName: string;
  memoDate: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type OperationLog = {
  id: number;
  operator: string;
  action: string;
  targetType: string;
  targetId: number | null;
  detail: string;
  createdAt: string;
};

export type EmployeeStats = {
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
};

export type DashboardData = {
  employees: Employee[];
  holidays: Holiday[];
  records: LeaveRecord[];
  holidayWorkRecords: HolidayWorkRecord[];
  memos: Memo[];
  operationLogs: OperationLog[];
  stats: EmployeeStats[];
};

// ---- Asia/Shanghai 时间口径 ----
// Intl 按上海时区取年月日，再拼成本地午夜 Date：后续所有日期比较
// （parseDateKey / toDateKey）都按本地分量算，两边口径一致。
const shanghaiDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function shanghaiTodayParts(): { year: number; month: number; day: number } {
  const [year, month, day] = shanghaiDay.format(new Date()).split('-').map(Number);
  return { year, month, day };
}

export function shanghaiToday(): Date {
  const { year, month, day } = shanghaiTodayParts();
  return new Date(year, month - 1, day);
}

export function shanghaiYear(): number {
  return shanghaiTodayParts().year;
}

export function shanghaiMonthKey(): string {
  const { year, month } = shanghaiTodayParts();
  return `${year}-${`${month}`.padStart(2, '0')}`;
}

// ---- 日期 / 数字格式（照搬来源 lib/utils.ts） ----

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatNumber(value: number) {
  if (!Number.isFinite(value)) {
    return '-';
  }

  const rounded = Math.round(value * 100) / 100;
  return `${Object.is(rounded, -0) ? 0 : rounded}`;
}

export function formatDaysAsDuration(days: number) {
  if (!Number.isFinite(days)) {
    return '-';
  }

  const sign = days < 0 ? '-' : '';
  // Leave and overtime values are recorded in half-hour increments.
  const totalHours = Math.round(Math.abs(days) * OVERTIME_HOURS_PER_COMP_DAY * 2) / 2;
  const wholeDays = Math.floor(totalHours / OVERTIME_HOURS_PER_COMP_DAY);
  const hours = totalHours - wholeDays * OVERTIME_HOURS_PER_COMP_DAY;

  return `${sign}${wholeDays}d${hours === 0 ? '' : `${formatNumber(hours)}h`}`;
}

// ---- 工作日 / 请假天数 / 年假发放 / 统计（照搬来源 lib/leave.ts） ----

export function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function eachDate(startDate: string, endDate: string) {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  const dates: string[] = [];

  for (const current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
    dates.push(toDateKey(current));
  }

  return dates;
}

export function calculateLeaveDays(
  startDate: string,
  endDate: string,
  unit: LeaveUnit,
  holidayDates: Set<string>,
  workdayDates: Set<string>,
) {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);

  if (start > end) {
    throw new Error('休假结束日期不能早于开始日期');
  }

  let workdays = 0;

  for (const key of eachDate(startDate, endDate)) {
    const date = parseDateKey(key);
    const isWorkdayOverride = workdayDates.has(key) && !holidayDates.has(key);
    if (isWorkdayOverride || (!isWeekend(date) && !holidayDates.has(key))) {
      workdays += 1;
    }
  }

  if (workdays === 0) {
    return 0;
  }

  if (unit === 'full') {
    return workdays;
  }

  if (startDate !== endDate) {
    throw new Error('半天假只支持选择同一天');
  }

  return 0.5;
}

export function getAnnualGranted(employee: Employee, asOf = shanghaiToday()) {
  if (!employee.hireDate) {
    return 0;
  }

  const hireDate = parseDateKey(employee.hireDate);
  let fullYears = asOf.getFullYear() - hireDate.getFullYear();
  const anniversaryThisYear = new Date(asOf.getFullYear(), hireDate.getMonth(), hireDate.getDate());

  if (asOf < anniversaryThisYear) {
    fullYears -= 1;
  }

  return Math.max(0, fullYears) * 5;
}

export function summarizeStats(
  employees: Employee[],
  records: LeaveRecord[],
  holidayWorkRecords: HolidayWorkRecord[],
  year: number,
  monthKey: string = shanghaiMonthKey(),
) {
  return employees.map<EmployeeStats>((employee) => {
    const employeeRecords = records.filter((record) => record.employeeId === employee.id);
    const employeeHolidayWorkRecords = holidayWorkRecords.filter(
      (record) => record.employeeId === employee.id,
    );
    const annualGranted = getAnnualGranted(employee);

    const sumByType = (type: LeaveType, currentYearOnly = true) =>
      employeeRecords
        .filter((record) => record.type === type && (!currentYearOnly || record.startDate.startsWith(`${year}-`)))
        .reduce((total, record) => total + record.days, 0);

    const personalUsed = sumByType('personal');
    const adjustedUsed = sumByType('adjusted');
    const compUsed = sumByType('comp');
    const compEarned = employeeHolidayWorkRecords
      .filter((record) => record.workDate.startsWith(`${year}-`))
      .reduce((total, record) => total + record.days, 0);
    const annualUsed = sumByType('annual', false);
    const monthlyUsed = employeeRecords
      .filter((record) => record.startDate.startsWith(monthKey))
      .reduce((total, record) => total + record.days, 0);
    const yearlyUsed = employeeRecords
      .filter((record) => record.startDate.startsWith(`${year}-`))
      .reduce((total, record) => total + record.days, 0);
    const annualBalance = employee.annualAdjustment + annualGranted - annualUsed;
    const allCompEarned = employeeHolidayWorkRecords.reduce((total, record) => total + record.days, 0);
    const allCompUsed = sumByType('comp', false);
    const compBalance = employee.compAdjustment + allCompEarned - allCompUsed;

    return {
      employeeId: employee.id,
      employeeName: employee.name,
      personalUsed,
      adjustedUsed,
      monthlyUsed,
      yearlyUsed,
      compUsed,
      compEarned,
      annualUsed,
      annualGranted,
      annualAdjustment: employee.annualAdjustment,
      compAdjustment: employee.compAdjustment,
      annualBalance,
      compBalance,
      totalBalance: annualBalance + compBalance,
    };
  });
}

export function getHolidayDateSet(holidays: Holiday[]) {
  return new Set(holidays.filter((holiday) => !holiday.isWorkday).map((holiday) => holiday.date));
}

export function getWorkdayDateSet(holidays: Holiday[]) {
  return new Set(holidays.filter((holiday) => holiday.isWorkday).map((holiday) => holiday.date));
}

// ---- 自动扣假拆分（来源 createLeaveRecord 的口径，抽出复用） ----
// 可用调休 = max(0, 调休余额)；年假部分 = min(max(0, 天数 - 可用调休), max(0, 年假余额))；
// 调休部分 = 天数 - 年假部分；超额部分计入调休（余额可为负）。
export function splitAutoLeave(
  days: number,
  annualBalance: number,
  compBalance: number,
): { type: LeaveType; days: number }[] {
  const availableComp = Math.max(0, compBalance);
  const annualDays = Math.min(Math.max(0, days - availableComp), Math.max(0, annualBalance));
  return [
    { type: 'comp' as const, days: days - annualDays },
    { type: 'annual' as const, days: annualDays },
  ].filter((part) => part.days > 0);
}

// ---- iCal 解析（照搬来源 lib/ical.ts） ----

export type HolidayFeedEvent = {
  date: string;
  name: string;
  region: HolidayRegion;
  isWorkday: boolean;
  source: string;
};

export const defaultHolidayFeeds = [
  {
    name: '中国大陆法定节假日调休补班',
    region: 'mainland' as const,
    url: 'https://yangh9.github.io/ChinaCalendar/cal_holiday.ics',
    source: 'ChinaCalendar iCal',
  },
  {
    name: '香港公众假期',
    region: 'hongkong' as const,
    url: 'https://www.1823.gov.hk/common/ical/sc.ics',
    source: '1823 Hong Kong Public Holidays iCal',
  },
];

function unfoldIcsLines(text: string) {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
}

function readIcsValue(line: string) {
  const index = line.indexOf(':');
  return index >= 0 ? line.slice(index + 1).trim() : '';
}

function dateFromIcsValue(value: string) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) {
    return '';
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function isWorkdaySummary(summary: string) {
  return /补班|上班|工作日/.test(summary) && !/假期|公眾假期|公众假期/.test(summary);
}

function cleanSummary(summary: string) {
  return summary
    .replace(/[「」]/g, '')
    .replace(/\s*第\d+天\/共\d+天\s*/g, '')
    .trim();
}

export function parseHolidayIcs(
  text: string,
  region: HolidayRegion,
  source: string,
): HolidayFeedEvent[] {
  const lines = unfoldIcsLines(text);
  const events: HolidayFeedEvent[] = [];
  let current: Record<string, string> | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }

    if (line === 'END:VEVENT') {
      if (current?.DTSTART && current.SUMMARY) {
        const startDate = dateFromIcsValue(current.DTSTART);
        const endDate = current.DTEND ? dateFromIcsValue(current.DTEND) : '';
        const isAllDayRange = Boolean(endDate) && endDate > startDate;
        const dates = isAllDayRange ? eachDate(startDate, previousDate(endDate)) : [startDate];
        const summary = cleanSummary(current.SUMMARY);

        for (const date of dates) {
          events.push({
            date,
            name: summary,
            region,
            isWorkday: isWorkdaySummary(summary),
            source,
          });
        }
      }

      current = null;
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith('DTSTART')) {
      current.DTSTART = readIcsValue(line);
    } else if (line.startsWith('DTEND')) {
      current.DTEND = readIcsValue(line);
    } else if (line.startsWith('SUMMARY')) {
      current.SUMMARY = readIcsValue(line);
    }
  }

  return events.filter((event) => event.date && event.name);
}

function previousDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(year, month - 1, day);
  value.setDate(value.getDate() - 1);
  return [
    value.getFullYear(),
    `${value.getMonth() + 1}`.padStart(2, '0'),
    `${value.getDate()}`.padStart(2, '0'),
  ].join('-');
}
