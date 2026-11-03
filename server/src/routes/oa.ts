import { Router, type Request } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { isValidDateString } from '../lib/dailyPicks.js';
import {
  OVERTIME_HOURS_PER_COMP_DAY,
  calculateLeaveDays,
  defaultHolidayFeeds,
  formatDaysAsDuration,
  getHolidayDateSet,
  getWorkdayDateSet,
  holidayRegions,
  leaveTypeLabels,
  leaveTypes,
  leaveUnits,
  parseHolidayIcs,
  shanghaiYear,
  splitAutoLeave,
  summarizeStats,
  type DashboardData,
  type Employee,
  type EmployeeStats,
  type Holiday,
  type HolidayWorkRecord,
  type LeaveRecord,
  type LeaveType,
  type LeaveUnit,
  type Memo,
  type OperationLog,
} from '../lib/oa.js';

// 2dqy-oa 假期管理移植：全部先过 requireAuth，写入一律 ADMIN。
// 操作日志 operator = JWT 用户的 name（来源的固定字串已废弃）。
// 错误统一抛 HttpError（由 errorHandler 转 { error, code }）。

export const oaRouter = Router();
oaRouter.use(requireAuth);

function assertOaAdmin(req: Request) {
  if (req.user!.role !== 'ADMIN') throw new HttpError(403, '只有管理员可以操作', 'FORBIDDEN');
}

function operatorName(req: Request) {
  return req.user!.name;
}

function parseId(req: Request) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, '参数无效', 'BAD_ID');
  return id;
}

function badRequest(message: string): HttpError {
  return new HttpError(400, message, 'BAD_REQUEST');
}

const dateString = z.string().refine((v) => isValidDateString(v), '日期格式不正确');

const employeeSchema = z.object({
  name: z.string().trim().min(1, '请输入员工姓名'),
  hireDate: dateString.optional(),
  annualAdjustment: z.number().finite().default(0),
  compAdjustment: z.number().finite().default(0),
});

const employeePatchSchema = z.object({
  name: z.string().trim().min(1, '请输入员工姓名').optional(),
  hireDate: z.string().nullable().optional(),
  annualAdjustment: z.number().finite().optional(),
  compAdjustment: z.number().finite().optional(),
});

const holidaySchema = z.object({
  date: dateString,
  region: z.enum(holidayRegions),
  name: z.string().trim().min(1, '请输入假期名称'),
  isWorkday: z.boolean().default(false),
});

const leaveTypeInputOptions = [...leaveTypes, 'auto'] as const;

const leaveRecordSchema = z.object({
  employeeId: z.number().int().positive('请选择员工'),
  type: z.enum(leaveTypeInputOptions),
  unit: z.enum(leaveUnits),
  startDate: dateString,
  endDate: dateString,
});

const leavePatchSchema = z.object({
  employeeId: z.number().int().positive('请选择员工').optional(),
  type: z.enum(leaveTypes).optional(),
  unit: z.enum(leaveUnits).optional(),
  startDate: dateString.optional(),
  endDate: dateString.optional(),
});

const overtimeSchema = z.object({
  employeeId: z.number().int().positive('请选择员工'),
  workDate: dateString,
  hours: z.number().finite('加班小时数无效').positive('加班小时数必须大于 0').max(24, '单次加班小时数不能超过 24 小时'),
});

const memoSchema = z.object({
  employeeId: z.number().int().positive('请选择员工'),
  memoDate: dateString,
  content: z.string().trim().min(1, '请输入备忘内容'),
});

const memoPatchSchema = z.object({
  employeeId: z.number().int().positive('请选择员工').optional(),
  memoDate: dateString.optional(),
  content: z.string().trim().min(1, '请输入备忘内容').optional(),
});

const importRowSchema = z.object({
  row: z.number().int(),
  name: z.string().trim().min(1, '姓名不能为空'),
  startDate: z.string(),
  endDate: z.string(),
  unit: z.string(),
  type: z.string(),
});

// ---- 行映射：Decimal → Number、Date → ISO（照来源 numberFromDb 等做法） ----

type LeaveRow = {
  id: number;
  employeeId: number;
  type: string;
  unit: string;
  startDate: string;
  endDate: string;
  days: Prisma.Decimal;
  createdAt: Date;
  employee: { name: string };
};

type OvertimeRow = {
  id: number;
  employeeId: number;
  workDate: string;
  hours: Prisma.Decimal;
  days: Prisma.Decimal;
  createdAt: Date;
  employee: { name: string };
};

type MemoRow = {
  id: number;
  employeeId: number;
  memoDate: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  employee: { name: string };
};

function mapEmployee(e: {
  id: number;
  name: string;
  hireDate: string | null;
  annualAdjustment: Prisma.Decimal;
  compAdjustment: Prisma.Decimal;
  createdAt: Date;
}): Employee {
  return {
    id: e.id,
    name: e.name,
    hireDate: e.hireDate,
    annualAdjustment: Number(e.annualAdjustment),
    compAdjustment: Number(e.compAdjustment),
    createdAt: e.createdAt.toISOString(),
  };
}

function mapHoliday(h: {
  id: number;
  date: string;
  region: string;
  name: string;
  isWorkday: boolean;
  source: string;
}): Holiday {
  return {
    id: h.id,
    date: h.date,
    region: h.region as Holiday['region'],
    name: h.name,
    isWorkday: h.isWorkday,
    source: h.source,
  };
}

function mapLeaveRecord(r: LeaveRow): LeaveRecord {
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employee.name,
    type: r.type as LeaveType,
    unit: r.unit as LeaveUnit,
    startDate: r.startDate,
    endDate: r.endDate,
    days: Number(r.days),
    createdAt: r.createdAt.toISOString(),
  };
}

function mapOvertimeRecord(r: OvertimeRow): HolidayWorkRecord {
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employee.name,
    workDate: r.workDate,
    hours: Number(r.hours),
    days: Number(r.days),
    createdAt: r.createdAt.toISOString(),
  };
}

function mapMemo(m: MemoRow): Memo {
  return {
    id: m.id,
    employeeId: m.employeeId,
    employeeName: m.employee.name,
    memoDate: m.memoDate,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

function mapOperationLog(l: {
  id: number;
  operator: string;
  action: string;
  targetType: string;
  targetId: number | null;
  detail: string;
  createdAt: Date;
}): OperationLog {
  return {
    id: l.id,
    operator: l.operator,
    action: l.action,
    targetType: l.targetType,
    targetId: l.targetId,
    detail: l.detail,
    createdAt: l.createdAt.toISOString(),
  };
}

async function logAction(
  operator: string,
  action: string,
  targetType: string,
  targetId: number | null,
  detail: string,
) {
  await prisma.oaOperationLog.create({
    data: { operator, action, targetType, targetId, detail },
  });
}

// ---- 汇总加载（dashboard / 新建 / 修改 / 导入共用） ----

async function loadOaData(withLogs: boolean) {
  const [employeeRows, holidayRows, recordRows, overtimeRows, memoRows, logRows] = await Promise.all([
    prisma.oaEmployee.findMany({ orderBy: { name: 'asc' } }),
    prisma.oaHoliday.findMany({ orderBy: { date: 'asc' } }),
    prisma.oaLeaveRecord.findMany({
      orderBy: { startDate: 'asc' },
      include: { employee: { select: { name: true } } },
    }),
    prisma.oaOvertimeRecord.findMany({
      orderBy: { workDate: 'asc' },
      include: { employee: { select: { name: true } } },
    }),
    prisma.oaMemo.findMany({
      orderBy: { memoDate: 'asc' },
      include: { employee: { select: { name: true } } },
    }),
    withLogs
      ? prisma.oaOperationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 500 })
      : Promise.resolve([]),
  ]);
  const employees = employeeRows.map(mapEmployee);
  const holidays = holidayRows.map(mapHoliday);
  const records = recordRows.map(mapLeaveRecord);
  const holidayWorkRecords = overtimeRows.map(mapOvertimeRecord);
  const memos = memoRows.map(mapMemo);
  const stats: EmployeeStats[] = summarizeStats(employees, records, holidayWorkRecords, shanghaiYear());
  return { employees, holidays, records, holidayWorkRecords, memos, stats, logRows };
}

function calcDaysOr400(startDate: string, endDate: string, unit: LeaveUnit, holidays: Holiday[]) {
  try {
    return calculateLeaveDays(startDate, endDate, unit, getHolidayDateSet(holidays), getWorkdayDateSet(holidays));
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : '休假天数计算失败');
  }
}

// ---- 仪表盘 ----

oaRouter.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const data = await loadOaData(true);
    const dashboard: DashboardData = {
      employees: data.employees,
      holidays: data.holidays,
      records: data.records,
      holidayWorkRecords: data.holidayWorkRecords,
      memos: data.memos,
      operationLogs: data.logRows.map(mapOperationLog),
      stats: data.stats,
    };
    res.json(dashboard);
  }),
);

// ---- 员工 ----

oaRouter.post(
  '/employees',
  asyncHandler(async (req, res) => {
    assertOaAdmin(req);
    const body = employeeSchema.parse(req.body);
    try {
      const employee = await prisma.oaEmployee.create({
        data: {
          name: body.name,
          hireDate: body.hireDate ?? null,
          annualAdjustment: body.annualAdjustment,
          compAdjustment: body.compAdjustment,
        },
      });
      await logAction(operatorName(req), 'create', 'employee', employee.id, `新增员工 ${body.name}`);
      res.json({ ok: true, message: '员工已新增', employee: mapEmployee(employee) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw badRequest('员工新增失败，可能存在同名员工');
      }
      throw error;
    }
  }),
);

oaRouter.patch(
  '/employees/:id',
  asyncHandler(async (req, res) => {
    assertOaAdmin(req);
    const id = parseId(req);
    const body = employeePatchSchema.parse(req.body);
    const existing = await prisma.oaEmployee.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, '员工不存在', 'NOT_FOUND');
    if (body.hireDate !== undefined && body.hireDate !== null && !isValidDateString(body.hireDate)) {
      throw badRequest('日期格式不正确');
    }
    try {
      const employee = await prisma.oaEmployee.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.hireDate !== undefined ? { hireDate: body.hireDate || null } : {}),
          ...(body.annualAdjustment !== undefined ? { annualAdjustment: body.annualAdjustment } : {}),
          ...(body.compAdjustment !== undefined ? { compAdjustment: body.compAdjustment } : {}),
        },
      });
      await logAction(operatorName(req), 'update', 'employee', id, '修改员工资料及假期设置');
      res.json({ ok: true, employee: mapEmployee(employee) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw badRequest('可能存在同名员工');
      }
      throw error;
    }
  }),
);

oaRouter.delete(
  '/employees/:id',
  asyncHandler(async (req, res) => {
    assertOaAdmin(req);
    const id = parseId(req);
    const existing = await prisma.oaEmployee.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, '员工不存在', 'NOT_FOUND');
    await prisma.oaEmployee.delete({ where: { id } });
    await logAction(operatorName(req), 'delete', 'employee', id, '删除员工及其休假记录');
    res.json({ ok: true });
  }),
);

// ---- 假期 ----

oaRouter.post(
  '/holidays',
  asyncHandler(async (req, res) => {
    assertOaAdmin(req);
    const body = holidaySchema.parse(req.body);
    try {
      const holiday = await prisma.oaHoliday.create({
        data: { ...body, source: 'manual' },
      });
      await logAction(operatorName(req), 'create', 'holiday', holiday.id, `新增假期 ${body.date} ${body.name}`);
      res.json({ ok: true, message: '假期已新增', holiday: mapHoliday(holiday) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw badRequest('假期新增失败，可能已存在同日期同地区假期');
      }
      throw error;
    }
  }),
);

oaRouter.delete(
  '/holidays/:id',
  asyncHandler(async (req, res) => {
    assertOaAdmin(req);
    const id = parseId(req);
    const existing = await prisma.oaHoliday.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, '假期不存在', 'NOT_FOUND');
    await prisma.oaHoliday.delete({ where: { id } });
    await logAction(operatorName(req), 'delete', 'holiday', id, '删除假期');
    res.json({ ok: true });
  }),
);

oaRouter.post(
  '/holidays/sync',
  asyncHandler(async (req, res) => {
    assertOaAdmin(req);
    let added = 0;
    let updated = 0;
    const failed: string[] = [];

    for (const feed of defaultHolidayFeeds) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        let response: Response;
        try {
          response = await fetch(feed.url, { signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const icsText = await response.text();
        const events = parseHolidayIcs(icsText, feed.region, feed.source);
        for (const event of events) {
          const existing = await prisma.oaHoliday.findUnique({
            where: { date_region: { date: event.date, region: event.region } },
          });
          if (existing) {
            await prisma.oaHoliday.update({
              where: { id: existing.id },
              data: { name: event.name, isWorkday: event.isWorkday, source: event.source },
            });
            updated += 1;
          } else {
            await prisma.oaHoliday.create({ data: event });
            added += 1;
          }
        }
      } catch (error) {
        failed.push(`${feed.name}: ${error instanceof Error ? error.message : '同步失败'}`);
      }
    }

    const imported = added + updated;
    await logAction(
      operatorName(req),
      'sync',
      'holiday',
      null,
      `同步默认假期日历，写入/更新 ${imported} 条${failed.length ? `，失败：${failed.join('；')}` : ''}`,
    );
    res.json({ added, updated, failed });
  }),
);

// ---- 休假记录 ----

oaRouter.post(
  '/leave',
  asyncHandler(async (req, res) => {
    assertOaAdmin(req);
    const body = leaveRecordSchema.parse(req.body);
    const data = await loadOaData(false);
    const days = calcDaysOr400(body.startDate, body.endDate, body.unit, data.holidays);
    if (days <= 0) {
      throw badRequest('所选日期不包含可扣假的工作日');
    }
    const employeeStats = data.stats.find((stat) => stat.employeeId === body.employeeId);
    if (!employeeStats) {
      throw badRequest('员工不存在');
    }
    if (body.type === 'annual' && days > employeeStats.annualBalance) {
      throw badRequest('年假余额不足，禁止提交');
    }
    const leaveParts =
      body.type === 'auto'
        ? splitAutoLeave(days, employeeStats.annualBalance, employeeStats.compBalance)
        : [{ type: body.type as LeaveType, days }];
    const created = await prisma.$transaction(async (tx) => {
      const rows: LeaveRow[] = [];
      for (const part of leaveParts) {
        const row = await tx.oaLeaveRecord.create({
          data: {
            employeeId: body.employeeId,
            type: part.type,
            unit: body.unit,
            startDate: body.startDate,
            endDate: body.endDate,
            days: part.days,
          },
          include: { employee: { select: { name: true } } },
        });
        rows.push(row);
      }
      await tx.oaOperationLog.create({
        data: {
          operator: operatorName(req),
          action: 'create',
          targetType: 'leave_record',
          targetId: rows[0]?.id ?? null,
          detail:
            body.type === 'auto'
              ? `自动扣假 ${leaveParts.map((part) => `${leaveTypeLabels[part.type]} ${formatDaysAsDuration(part.days)}`).join('、')}`
              : `新增休假记录 ${formatDaysAsDuration(days)}`,
        },
      });
      return rows;
    });
    const records = created.map(mapLeaveRecord);
    res.json({
      ok: true,
      message:
        body.type === 'auto'
          ? `已自动扣假：${leaveParts.map((part) => `${leaveTypeLabels[part.type]} ${formatDaysAsDuration(part.days)}`).join('，')}`
          : `休假记录已新增，计 ${formatDaysAsDuration(days)}`,
      records,
    });
  }),
);

oaRouter.patch(
  '/leave/:id',
  asyncHandler(async (req, res) => {
    assertOaAdmin(req);
    const id = parseId(req);
    const body = leavePatchSchema.parse(req.body);
    const existing = await prisma.oaLeaveRecord.findUnique({
      where: { id },
      include: { employee: { select: { name: true } } },
    });
    if (!existing) throw new HttpError(404, '休假记录不存在', 'NOT_FOUND');
    const employeeId = body.employeeId ?? existing.employeeId;
    const type = (body.type ?? existing.type) as LeaveType;
    const unit = (body.unit ?? existing.unit) as LeaveUnit;
    const startDate = body.startDate ?? existing.startDate;
    const endDate = body.endDate ?? existing.endDate;
    const data = await loadOaData(false);
    const days = calcDaysOr400(startDate, endDate, unit, data.holidays);
    if (days <= 0) {
      throw badRequest('所选日期不包含可扣假的工作日');
    }
    if (type === 'annual') {
      // 用排除本笔后的余额重检：本笔若原为年假，先把它加回余额再比。
      const statsExcl = summarizeStats(
        data.employees,
        data.records.filter((r) => r.id !== id),
        data.holidayWorkRecords,
        shanghaiYear(),
      );
      const statExcl = statsExcl.find((s) => s.employeeId === employeeId);
      if (!statExcl) throw badRequest('员工不存在');
      if (days > statExcl.annualBalance) {
        throw badRequest('年假余额不足，禁止提交');
      }
    }
    const updatedRow = await prisma.oaLeaveRecord.update({
      where: { id },
      data: { employeeId, type, unit, startDate, endDate, days },
      include: { employee: { select: { name: true } } },
    });
    await logAction(operatorName(req), 'update', 'leave_record', id, `修改休假记录 ${formatDaysAsDuration(days)}`);
    res.json({ ok: true, record: mapLeaveRecord(updatedRow) });
  }),
);

oaRouter.delete(
  '/leave/:id',
  asyncHandler(async (req, res) => {
    assertOaAdmin(req);
    const id = parseId(req);
    const existing = await prisma.oaLeaveRecord.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, '休假记录不存在', 'NOT_FOUND');
    await prisma.oaLeaveRecord.delete({ where: { id } });
    await logAction(operatorName(req), 'delete', 'leave_record', id, '删除休假记录');
    res.json({ ok: true });
  }),
);

// ---- 休假导入（Excel 解析在客户端做，这里只收行数据） ----

oaRouter.post(
  '/leave/import',
  asyncHandler(async (req, res) => {
    assertOaAdmin(req);
    const body = z.object({ rows: z.array(importRowSchema) }).parse(req.body);
    const data = await loadOaData(false);
    const byName = new Map(data.employees.map((e) => [e.name, e]));
    // 按顺序扣余额：annual 行依次扣年假，auto 行按拆分同时扣两项。
    const running = new Map<number, { annualBalance: number; compBalance: number }>();
    for (const s of data.stats) {
      running.set(s.employeeId, { annualBalance: s.annualBalance, compBalance: s.compBalance });
    }
    const errors: { row: number; reason: string }[] = [];
    const pending: { employeeId: number; type: LeaveType; unit: LeaveUnit; startDate: string; endDate: string; days: number }[] = [];
    for (const row of body.rows) {
      const fail = (reason: string) => errors.push({ row: row.row, reason });
      const employee = byName.get(row.name);
      if (!employee) {
        fail(`员工不存在：${row.name}`);
        continue;
      }
      if (!isValidDateString(row.startDate) || !isValidDateString(row.endDate)) {
        fail('日期格式不正确');
        continue;
      }
      if (!(leaveUnits as readonly string[]).includes(row.unit)) {
        fail(`单位无效：${row.unit}`);
        continue;
      }
      const unit = row.unit as LeaveUnit;
      const isAuto = row.type === 'auto';
      if (!isAuto && !(leaveTypes as readonly string[]).includes(row.type)) {
        fail(`类型无效：${row.type}`);
        continue;
      }
      let days: number;
      try {
        days = calculateLeaveDays(row.startDate, row.endDate, unit, getHolidayDateSet(data.holidays), getWorkdayDateSet(data.holidays));
      } catch (error) {
        fail(error instanceof Error ? error.message : '休假天数计算失败');
        continue;
      }
      if (days <= 0) {
        fail('所选日期不包含可扣假的工作日');
        continue;
      }
      const balance = running.get(employee.id)!;
      if (isAuto) {
        const parts = splitAutoLeave(days, balance.annualBalance, balance.compBalance);
        for (const part of parts) {
          pending.push({ employeeId: employee.id, type: part.type, unit, startDate: row.startDate, endDate: row.endDate, days: part.days });
          if (part.type === 'annual') balance.annualBalance -= part.days;
          else balance.compBalance -= part.days;
        }
      } else {
        const type = row.type as LeaveType;
        if (type === 'annual' && days > balance.annualBalance) {
          fail('年假余额不足，禁止提交');
          continue;
        }
        pending.push({ employeeId: employee.id, type, unit, startDate: row.startDate, endDate: row.endDate, days });
        if (type === 'annual') balance.annualBalance -= days;
        if (type === 'comp') balance.compBalance -= days;
      }
    }
    if (pending.length) {
      await prisma.$transaction(async (tx) => {
        for (const item of pending) {
          await tx.oaLeaveRecord.create({ data: item });
        }
        await tx.oaOperationLog.create({
          data: {
            operator: operatorName(req),
            action: 'import',
            targetType: 'leave_record',
            targetId: null,
            detail: `导入休假记录 ${pending.length} 条，失败 ${errors.length} 条`,
          },
        });
      });
    }
    res.json({ inserted: pending.length, errors });
  }),
);

// ---- 加班登记 ----

oaRouter.post(
  '/overtime',
  asyncHandler(async (req, res) => {
    assertOaAdmin(req);
    const body = overtimeSchema.parse(req.body);
    const employee = await prisma.oaEmployee.findUnique({ where: { id: body.employeeId } });
    if (!employee) throw badRequest('员工不存在');
    const days = Number((body.hours / OVERTIME_HOURS_PER_COMP_DAY).toFixed(4));
    const record = await prisma.oaOvertimeRecord.create({
      data: { employeeId: body.employeeId, workDate: body.workDate, hours: body.hours, days },
      include: { employee: { select: { name: true } } },
    });
    await logAction(
      operatorName(req),
      'create',
      'overtime_record',
      record.id,
      `新增加班登记 ${body.hours} 小时，折算 ${formatDaysAsDuration(days)} 调休`,
    );
    res.json({
      ok: true,
      message: `已增加该员工调休余额 ${formatDaysAsDuration(days)}（加班 ${body.hours} 小时）`,
      record: mapOvertimeRecord(record),
    });
  }),
);

oaRouter.delete(
  '/overtime/:id',
  asyncHandler(async (req, res) => {
    assertOaAdmin(req);
    const id = parseId(req);
    const existing = await prisma.oaOvertimeRecord.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, '加班记录不存在', 'NOT_FOUND');
    await prisma.oaOvertimeRecord.delete({ where: { id } });
    await logAction(operatorName(req), 'delete', 'overtime_record', id, '删除加班登记，调休余额同步扣回');
    res.json({ ok: true });
  }),
);

// ---- 备忘录 ----

oaRouter.post(
  '/memos',
  asyncHandler(async (req, res) => {
    assertOaAdmin(req);
    const body = memoSchema.parse(req.body);
    const employee = await prisma.oaEmployee.findUnique({ where: { id: body.employeeId } });
    if (!employee) throw badRequest('员工不存在');
    const memo = await prisma.oaMemo.create({
      data: body,
      include: { employee: { select: { name: true } } },
    });
    await logAction(operatorName(req), 'create', 'memo', memo.id, `新增备忘 ${body.memoDate}`);
    res.json({ ok: true, message: '备忘录已新增', memo: mapMemo(memo) });
  }),
);

oaRouter.patch(
  '/memos/:id',
  asyncHandler(async (req, res) => {
    assertOaAdmin(req);
    const id = parseId(req);
    const body = memoPatchSchema.parse(req.body);
    const existing = await prisma.oaMemo.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, '备忘不存在', 'NOT_FOUND');
    if (body.employeeId !== undefined) {
      const employee = await prisma.oaEmployee.findUnique({ where: { id: body.employeeId } });
      if (!employee) throw badRequest('员工不存在');
    }
    const memo = await prisma.oaMemo.update({
      where: { id },
      data: { ...body, updatedAt: new Date() },
      include: { employee: { select: { name: true } } },
    });
    await logAction(operatorName(req), 'update', 'memo', id, `修改备忘 ${memo.memoDate}`);
    res.json({ ok: true, memo: mapMemo(memo) });
  }),
);

oaRouter.delete(
  '/memos/:id',
  asyncHandler(async (req, res) => {
    assertOaAdmin(req);
    const id = parseId(req);
    const existing = await prisma.oaMemo.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, '备忘不存在', 'NOT_FOUND');
    await prisma.oaMemo.delete({ where: { id } });
    await logAction(operatorName(req), 'delete', 'memo', id, '删除备忘');
    res.json({ ok: true });
  }),
);

// ---- 操作日志（登录即可） ----

oaRouter.get(
  '/logs',
  asyncHandler(async (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20) || 20));
    const offset = Math.max(0, Number(req.query.offset ?? 0) || 0);
    const [total, rows] = await Promise.all([
      prisma.oaOperationLog.count(),
      prisma.oaOperationLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);
    res.json({ total, logs: rows.map(mapOperationLog) });
  }),
);
