import { Router } from 'express';
import fs from 'node:fs';
import Papa from 'papaparse';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireEmailVerified } from '../middleware/requireEmailVerified.js';
import { uploadCsv } from '../lib/upload.js';
import { tableToCsv, tableToXlsx } from '../lib/export.js';
import { contentDispositionAttachment } from '../lib/filename.js';

export const tableRouter = Router();
tableRouter.use(requireAuth, requireEmailVerified);

const FIELD_TYPES = [
  'text',
  'longtext',
  'number',
  'date',
  'datetime',
  'select',
  'multiselect',
  'checkbox',
  'url',
  'email',
  'phone',
  'rating',
  'progress',
  'user',
  'attachment',
  'formula',
] as const;

interface TemplateField {
  name: string;
  type: (typeof FIELD_TYPES)[number];
  options?: Record<string, unknown>;
}

interface Template {
  key: string;
  name: string;
  description: string;
  fields: TemplateField[];
  sampleRecords?: Record<string, unknown>[];
}

const templates: Template[] = [
  {
    key: 'project_tasks',
    name: '项目任务管理',
    description: '跟踪任务、负责人、优先级、截止日期、进度与附件',
    fields: [
      { name: '任务名称', type: 'text' },
      {
        name: '状态',
        type: 'select',
        options: { choices: ['待开始', '进行中', '已完成', '已暂停'] },
      },
      { name: '负责人', type: 'user' },
      { name: '优先级', type: 'rating' },
      { name: '开始日期', type: 'date' },
      { name: '截止日期', type: 'date' },
      { name: '进度', type: 'progress' },
      { name: '相关文件', type: 'attachment' },
    ],
    sampleRecords: [
      { 任务名称: '完成 PRD 评审', 状态: '进行中', 优先级: 4, 进度: 60 },
      { 任务名称: '搭建后端骨架', 状态: '已完成', 优先级: 5, 进度: 100 },
    ],
  },
  {
    key: 'content_library',
    name: '内容选题库',
    description: '管理选题、作者、审核、发布渠道',
    fields: [
      { name: '标题', type: 'text' },
      { name: '类型', type: 'select', options: { choices: ['图文', '视频', '播客'] } },
      { name: '作者', type: 'user' },
      {
        name: '状态',
        type: 'select',
        options: { choices: ['选题', '撰写', '审核', '已发布'] },
      },
      { name: '发布时间', type: 'datetime' },
      { name: '渠道', type: 'multiselect', options: { choices: ['公众号', '小红书', '抖音'] } },
      { name: '附件', type: 'attachment' },
    ],
  },
  {
    key: 'crm_pipeline',
    name: '客户跟进表',
    description: '记录客户阶段、金额、跟进时间',
    fields: [
      { name: '客户名称', type: 'text' },
      { name: '联系人', type: 'text' },
      { name: '邮箱', type: 'email' },
      { name: '电话', type: 'phone' },
      {
        name: '阶段',
        type: 'select',
        options: { choices: ['线索', '商机', '谈判', '成交', '流失'] },
      },
      { name: '预计金额', type: 'number' },
      { name: '下次跟进时间', type: 'datetime' },
      { name: '负责人', type: 'user' },
    ],
    sampleRecords: [
      { 客户名称: '示例客户 A', 联系人: '张三', 阶段: '商机', 预计金额: 30000 },
      { 客户名称: '示例客户 B', 联系人: '李四', 阶段: '谈判', 预计金额: 80000 },
    ],
  },
  {
    key: 'bug_tracker',
    name: 'Bug 跟踪',
    description: '记录问题严重度、状态、修复',
    fields: [
      { name: '问题标题', type: 'text' },
      {
        name: '严重程度',
        type: 'select',
        options: { choices: ['P0 阻塞', 'P1 严重', 'P2 一般', 'P3 轻微'] },
      },
      {
        name: '状态',
        type: 'select',
        options: { choices: ['新建', '处理中', '已解决', '已关闭'] },
      },
      { name: '负责人', type: 'user' },
      { name: '关联版本', type: 'text' },
      { name: '修复日期', type: 'date' },
      { name: '日志附件', type: 'attachment' },
    ],
    sampleRecords: [
      { 问题标题: '登录后偶发空白页', 严重程度: 'P1 严重', 状态: '处理中', 关联版本: 'v0.9' },
      { 问题标题: '导出文件名乱码', 严重程度: 'P2 一般', 状态: '已解决', 关联版本: 'v0.9' },
    ],
  },
  {
    key: 'habit_tracker',
    name: '个人习惯追踪',
    description: '记录每日习惯打卡',
    fields: [
      { name: '事项', type: 'text' },
      { name: '日期', type: 'date' },
      { name: '是否完成', type: 'checkbox' },
      { name: '连续天数', type: 'number' },
      { name: '备注', type: 'longtext' },
    ],
    sampleRecords: [
      { 事项: '阅读 30 分钟', 是否完成: true, 连续天数: 7 },
      { 事项: '复盘当天工作', 是否完成: false, 连续天数: 3 },
    ],
  },
  {
    key: 'asset_inventory',
    name: '资产台账',
    description: '记录设备、采购、保管人、状态与保修到期日',
    fields: [
      { name: '资产名称', type: 'text' },
      { name: '资产编号', type: 'text' },
      { name: '分类', type: 'select', options: { choices: ['电脑', '显示器', '网络设备', '办公用品'] } },
      { name: '保管人', type: 'user' },
      { name: '购入日期', type: 'date' },
      { name: '保修到期', type: 'date' },
      { name: '状态', type: 'select', options: { choices: ['在用', '闲置', '维修中', '报废'] } },
      { name: '附件', type: 'attachment' },
    ],
    sampleRecords: [
      { 资产名称: 'MacBook Pro', 资产编号: 'IT-2026-001', 分类: '电脑', 状态: '在用' },
      { 资产名称: '会议室显示器', 资产编号: 'IT-2026-002', 分类: '显示器', 状态: '闲置' },
    ],
  },
  {
    key: 'hiring_pipeline',
    name: '招聘候选人',
    description: '管理候选人来源、面试阶段、评分与下一步安排',
    fields: [
      { name: '候选人', type: 'text' },
      { name: '岗位', type: 'text' },
      { name: '来源', type: 'select', options: { choices: ['内推', '招聘网站', '主动投递', '猎头'] } },
      {
        name: '阶段',
        type: 'select',
        options: { choices: ['简历筛选', '一面', '二面', 'Offer', '已入职', '不合适'] },
      },
      { name: '面试时间', type: 'datetime' },
      { name: '评分', type: 'rating' },
      { name: '负责人', type: 'user' },
      { name: '简历附件', type: 'attachment' },
    ],
    sampleRecords: [
      { 候选人: '王小明', 岗位: '前端工程师', 来源: '内推', 阶段: '一面', 评分: 4 },
      { 候选人: '陈小雨', 岗位: '产品经理', 来源: '主动投递', 阶段: '简历筛选', 评分: 3 },
    ],
  },
];

async function loadTable(userId: string, tableId: string) {
  const table = await prisma.tableBase.findUnique({
    where: { id: tableId },
    include: { workspace: true, permissions: true },
  });
  if (!table) throw new HttpError(404, '数据表不存在', 'NOT_FOUND');
  const isOwner = table.workspace.ownerId === userId || table.createdById === userId;
  const perm = table.permissions.find((p) => p.userId === userId);
  if (isOwner) return { table, role: 'OWNER', canWrite: true };
  // 被明确授权的人按授权走（公共空间里被设为 VIEWER 的人保持只读，与文档一致）
  if (perm) return { table, role: perm.role, canWrite: perm.role === 'EDITOR' };
  if (table.workspace.kind === 'PUBLIC') {
    // 与文档的公共规则对齐：公共空间的数据表默认可读可编辑，管理员同权
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (user?.role === 'ADMIN') return { table, role: 'ADMIN', canWrite: true };
    return { table, role: 'EDITOR', canWrite: true };
  }
  throw new HttpError(403, '无权限', 'FORBIDDEN');
}

function assertWrite(ctx: { canWrite: boolean }) {
  if (!ctx.canWrite) throw new HttpError(403, '只读权限', 'READONLY');
}

async function assertRecordInTable(tableId: string, recordId: string) {
  const record = await prisma.tableRecord.findFirst({ where: { id: recordId, tableId }, select: { id: true } });
  if (!record) throw new HttpError(404, '记录不存在', 'RECORD_NOT_FOUND');
}

async function assertFieldInTable(tableId: string, fieldId: string) {
  const field = await prisma.tableField.findFirst({ where: { id: fieldId, tableId }, select: { id: true } });
  if (!field) throw new HttpError(404, '字段不存在', 'FIELD_NOT_FOUND');
}

tableRouter.get(
  '/templates',
  asyncHandler(async (_req, res) => {
    res.json({ templates });
  }),
);

tableRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const workspaces = await prisma.workspace.findMany({
      where: { ownerId: req.user!.id },
      select: { id: true },
    });
    const ownList = await prisma.tableBase.findMany({
      where: { workspaceId: { in: workspaces.map((w) => w.id) } },
      orderBy: { updatedAt: 'desc' },
    });
    const sharedList = await prisma.tableBase.findMany({
      where: {
        permissions: { some: { userId: req.user!.id } },
        workspace: { ownerId: { not: req.user!.id } },
      },
      orderBy: { updatedAt: 'desc' },
      include: { workspace: { select: { id: true, name: true } } },
    });
    // 公共空间的数据表对所有人可见（与文档的公共规则对齐），并入列表并去重
    const publicWs = await prisma.workspace.findFirst({ where: { kind: 'PUBLIC' }, select: { id: true } });
    const publicList = publicWs
      ? await prisma.tableBase.findMany({
          where: { workspaceId: publicWs.id },
          orderBy: { updatedAt: 'desc' },
          include: { workspace: { select: { id: true, name: true, ownerId: true } } },
        })
      : [];
    const seen = new Set([...ownList.map((t) => t.id), ...sharedList.map((t) => t.id)]);
    const extraPublic = publicList.filter((t) => !seen.has(t.id));
    // canManage：只有所有者/空间主人/管理员能改名与删除整表，前端据此收起管理按钮
    const annotate = (t: { createdById: string; workspace?: { ownerId?: string } | null }) => ({
      ...t,
      canManage:
        req.user!.role === 'ADMIN' || t.createdById === req.user!.id || t.workspace?.ownerId === req.user!.id,
    });
    res.json({ list: [...ownList.map(annotate), ...extraPublic.map(annotate)], sharedList });
  }),
);

tableRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        workspaceId: z.string(),
        name: z.string().trim().min(1).max(60),
        templateKey: z.string().nullable().optional(),
      })
      .parse(req.body);
    const ws = await prisma.workspace.findUnique({ where: { id: body.workspaceId } });
    if (!ws || ws.ownerId !== req.user!.id) throw new HttpError(403, '无权限', 'FORBIDDEN');
    const template = body.templateKey ? templates.find((t) => t.key === body.templateKey) : undefined;
    const table = await prisma.tableBase.create({
      data: {
        workspaceId: ws.id,
        name: body.name,
        templateKey: body.templateKey ?? null,
        createdById: req.user!.id,
      },
    });
    if (template) {
      await prisma.$transaction(
        template.fields.map((f, i) =>
          prisma.tableField.create({
            data: {
              tableId: table.id,
              name: f.name,
              type: f.type,
              options: JSON.stringify(f.options ?? {}),
              order: i,
            },
          }),
        ),
      );
      if (template.sampleRecords && template.sampleRecords.length > 0) {
        await prisma.$transaction(
          template.sampleRecords.map((data, i) =>
            prisma.tableRecord.create({
              data: { tableId: table.id, dataJson: JSON.stringify(data), order: i },
            }),
          ),
        );
      }
    } else {
      await prisma.tableField.create({
        data: { tableId: table.id, name: '名称', type: 'text', options: '{}', order: 0 },
      });
    }
    res.json({ table });
  }),
);

tableRouter.post(
  '/import-csv',
  uploadCsv.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, '没有收到 CSV', 'NO_FILE');
    const workspaceId = (req.body?.workspaceId as string | undefined)?.trim();
    const name = ((req.body?.name as string | undefined)?.trim() || req.file.originalname.replace(/\.csv$/i, '')).slice(0, 60) || '导入的数据表';
    if (!workspaceId) throw new HttpError(400, '缺少 workspaceId', 'INVALID');
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws || ws.ownerId !== req.user!.id) throw new HttpError(403, '无权限', 'FORBIDDEN');
    let parsed: Papa.ParseResult<Record<string, string>>;
    try {
      const text = fs.readFileSync(req.file.path, 'utf-8');
      parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
      });
    } catch (err) {
      throw new HttpError(400, '解析 CSV 失败', 'PARSE_FAILED');
    } finally {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
    }
    const headers = parsed.meta.fields || [];
    if (headers.length === 0) throw new HttpError(400, 'CSV 没有表头', 'NO_HEADERS');
    const table = await prisma.tableBase.create({
      data: { workspaceId, name, createdById: req.user!.id },
    });
    await prisma.$transaction(
      headers.map((h, i) =>
        prisma.tableField.create({
          data: { tableId: table.id, name: h.trim().slice(0, 40) || `字段${i + 1}`, type: 'text', options: '{}', order: i },
        }),
      ),
    );
    if (parsed.data.length > 0) {
      const data = parsed.data.slice(0, 5000);
      await prisma.$transaction(
        data.map((row, i) =>
          prisma.tableRecord.create({
            data: { tableId: table.id, dataJson: JSON.stringify(row), order: i },
          }),
        ),
      );
    }
    res.json({ table });
  }),
);

tableRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { table, role } = await loadTable(req.user!.id, req.params.id);
    const fields = await prisma.tableField.findMany({
      where: { tableId: table.id },
      orderBy: { order: 'asc' },
    });
    const records = await prisma.tableRecord.findMany({
      where: { tableId: table.id },
      orderBy: { order: 'asc' },
    });
    res.json({
      table,
      role,
      fields: fields.map((f) => ({ ...f, options: JSON.parse(f.options || '{}') })),
      records: records.map((r) => ({ ...r, data: JSON.parse(r.dataJson || '{}') })),
    });
  }),
);

tableRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const ctx = await loadTable(req.user!.id, req.params.id);
    assertWrite(ctx);
    const body = z.object({ name: z.string().trim().min(1).max(60).optional() }).parse(req.body);
    const updated = await prisma.tableBase.update({ where: { id: ctx.table.id }, data: body });
    res.json({ table: updated });
  }),
);

tableRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const ctx = await loadTable(req.user!.id, req.params.id);
    if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN') throw new HttpError(403, '只有所有者可以删除数据表', 'FORBIDDEN');
    await prisma.tableBase.delete({ where: { id: ctx.table.id } });
    res.json({ ok: true });
  }),
);

tableRouter.get(
  '/:id/export',
  asyncHandler(async (req, res) => {
    const ctx = await loadTable(req.user!.id, req.params.id);
    const format = (req.query.format as string) || 'csv';
    const fields = await prisma.tableField.findMany({
      where: { tableId: ctx.table.id },
      orderBy: { order: 'asc' },
    });
    const records = await prisma.tableRecord.findMany({
      where: { tableId: ctx.table.id },
      orderBy: { order: 'asc' },
    });
    const data = {
      name: ctx.table.name,
      fields: fields.map((f) => ({ name: f.name, type: f.type })),
      records: records.map((r) => ({ data: JSON.parse(r.dataJson || '{}') })),
    };
    const safeName = ctx.table.name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || '表格';
    if (format === 'csv') {
      const csv = await tableToCsv(data);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', contentDispositionAttachment(`${safeName}.csv`));
      // CSV BOM to help spreadsheet tools recognize UTF-8
      res.send(`\uFEFF${csv}`);
      return;
    }
    if (format === 'xlsx') {
      const buf = await tableToXlsx(data);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', contentDispositionAttachment(`${safeName}.xlsx`));
      res.send(buf);
      return;
    }
    throw new HttpError(400, '不支持的导出格式', 'INVALID_FORMAT');
  }),
);

tableRouter.post(
  '/:id/fields',
  asyncHandler(async (req, res) => {
    const ctx = await loadTable(req.user!.id, req.params.id);
    assertWrite(ctx);
    const body = z
      .object({
        name: z.string().trim().min(1).max(40),
        type: z.enum(FIELD_TYPES),
        options: z.any().optional(),
      })
      .parse(req.body);
    const order = await prisma.tableField.count({ where: { tableId: ctx.table.id } });
    const field = await prisma.tableField.create({
      data: {
        tableId: ctx.table.id,
        name: body.name,
        type: body.type,
        options: JSON.stringify(body.options ?? {}),
        order,
      },
    });
    res.json({ field: { ...field, options: JSON.parse(field.options) } });
  }),
);

tableRouter.patch(
  '/:id/fields/:fieldId',
  asyncHandler(async (req, res) => {
    const ctx = await loadTable(req.user!.id, req.params.id);
    assertWrite(ctx);
    const body = z
      .object({
        name: z.string().trim().min(1).max(40).optional(),
        options: z.any().optional(),
      })
      .parse(req.body);
    await assertFieldInTable(ctx.table.id, req.params.fieldId);
    const field = await prisma.tableField.update({
      where: { id: req.params.fieldId },
      data: {
        name: body.name,
        options: body.options === undefined ? undefined : JSON.stringify(body.options),
      },
    });
    res.json({ field: { ...field, options: JSON.parse(field.options) } });
  }),
);

tableRouter.delete(
  '/:id/fields/:fieldId',
  asyncHandler(async (req, res) => {
    const ctx = await loadTable(req.user!.id, req.params.id);
    assertWrite(ctx);
    await assertFieldInTable(ctx.table.id, req.params.fieldId);
    await prisma.tableField.delete({ where: { id: req.params.fieldId } });
    res.json({ ok: true });
  }),
);

tableRouter.post(
  '/:id/records',
  asyncHandler(async (req, res) => {
    const ctx = await loadTable(req.user!.id, req.params.id);
    assertWrite(ctx);
    const body = z.object({ data: z.record(z.any()).optional() }).parse(req.body);
    const order = await prisma.tableRecord.count({ where: { tableId: ctx.table.id } });
    const record = await prisma.tableRecord.create({
      data: {
        tableId: ctx.table.id,
        dataJson: JSON.stringify(body.data ?? {}),
        order,
      },
    });
    res.json({ record: { ...record, data: JSON.parse(record.dataJson) } });
  }),
);

tableRouter.patch(
  '/:id/records/:recordId',
  asyncHandler(async (req, res) => {
    const ctx = await loadTable(req.user!.id, req.params.id);
    assertWrite(ctx);
    const body = z.object({ data: z.record(z.any()) }).parse(req.body);
    await assertRecordInTable(ctx.table.id, req.params.recordId);
    const record = await prisma.tableRecord.update({
      where: { id: req.params.recordId },
      data: { dataJson: JSON.stringify(body.data) },
    });
    res.json({ record: { ...record, data: JSON.parse(record.dataJson) } });
  }),
);

tableRouter.delete(
  '/:id/records/:recordId',
  asyncHandler(async (req, res) => {
    const ctx = await loadTable(req.user!.id, req.params.id);
    assertWrite(ctx);
    await assertRecordInTable(ctx.table.id, req.params.recordId);
    await prisma.tableRecord.delete({ where: { id: req.params.recordId } });
    res.json({ ok: true });
  }),
);

tableRouter.get(
  '/:id/collaborators',
  asyncHandler(async (req, res) => {
    const ctx = await loadTable(req.user!.id, req.params.id);
    const owner = await prisma.user.findUnique({
      where: { id: ctx.table.createdById },
      select: { id: true, email: true, name: true, avatarUrl: true },
    });
    const collaborators = await prisma.tablePermission.findMany({
      where: { tableId: ctx.table.id },
      include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ owner, collaborators });
  }),
);

tableRouter.post(
  '/:id/collaborators',
  asyncHandler(async (req, res) => {
    const ctx = await loadTable(req.user!.id, req.params.id);
    if (ctx.role !== 'OWNER') throw new HttpError(403, '需要所有者权限', 'FORBIDDEN');
    const body = z
      .object({
        userId: z.string().optional(),
        email: z.string().email().optional(),
        role: z.enum(['VIEWER', 'EDITOR']).default('VIEWER'),
      })
      .refine((v) => v.userId || v.email, '需要 userId 或 email')
      .parse(req.body);
    const user = body.userId
      ? await prisma.user.findUnique({ where: { id: body.userId } })
      : await prisma.user.findUnique({ where: { email: body.email!.toLowerCase() } });
    if (!user) throw new HttpError(404, '找不到该用户', 'USER_NOT_FOUND');
    if (user.id === ctx.table.createdById) {
      throw new HttpError(400, '不能添加表格创建者本人', 'INVALID');
    }
    const perm = await prisma.tablePermission.upsert({
      where: { tableId_userId: { tableId: ctx.table.id, userId: user.id } },
      update: { role: body.role },
      create: { tableId: ctx.table.id, userId: user.id, role: body.role },
      include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } },
    });
    res.json({ collaborator: perm });
  }),
);

tableRouter.patch(
  '/:id/collaborators/:userId',
  asyncHandler(async (req, res) => {
    const ctx = await loadTable(req.user!.id, req.params.id);
    if (ctx.role !== 'OWNER') throw new HttpError(403, '需要所有者权限', 'FORBIDDEN');
    const body = z.object({ role: z.enum(['VIEWER', 'EDITOR']) }).parse(req.body);
    const perm = await prisma.tablePermission.update({
      where: { tableId_userId: { tableId: ctx.table.id, userId: req.params.userId } },
      data: { role: body.role },
      include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } },
    });
    res.json({ collaborator: perm });
  }),
);

tableRouter.delete(
  '/:id/collaborators/:userId',
  asyncHandler(async (req, res) => {
    const ctx = await loadTable(req.user!.id, req.params.id);
    if (ctx.role !== 'OWNER') throw new HttpError(403, '需要所有者权限', 'FORBIDDEN');
    await prisma.tablePermission.delete({
      where: { tableId_userId: { tableId: ctx.table.id, userId: req.params.userId } },
    });
    res.json({ ok: true });
  }),
);
