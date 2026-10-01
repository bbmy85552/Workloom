import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../lib/asyncHandler.js';
import { requireApiKey } from '../middleware/apiKeyAuth.js';
import { computeAccess, loadDocWithAccess } from '../lib/docAccess.js';

export const cliRouter = Router();
cliRouter.use(requireApiKey);

const FOLDER_CONTENT = '<div data-jianji-type="folder"></div>';
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

function isFolderContent(contentJson: string | null | undefined) {
  return (contentJson ?? '').includes('data-jianji-type="folder"');
}

function withFolderFlag<T extends { contentJson?: string | null }>(doc: T) {
  return { ...doc, isFolder: isFolderContent(doc.contentJson) };
}

async function findTargetWorkspace(userId: string, kind: 'PRIVATE' | 'PUBLIC') {
  if (kind === 'PUBLIC') {
    const ws = await prisma.workspace.findFirst({ where: { kind: 'PUBLIC' } });
    if (!ws) throw new HttpError(500, '公共知识库尚未初始化', 'PUBLIC_WS_MISSING');
    return ws;
  }
  const ws = await prisma.workspace.findFirst({
    where: { ownerId: userId, kind: 'PRIVATE' },
    orderBy: { createdAt: 'asc' },
  });
  if (!ws) throw new HttpError(404, '没有可用的私人工作区', 'NO_WORKSPACE');
  return ws;
}

async function loadTable(userId: string, tableId: string) {
  const table = await prisma.tableBase.findUnique({
    where: { id: tableId },
    include: { workspace: true, permissions: true },
  });
  if (!table) throw new HttpError(404, '数据表不存在', 'NOT_FOUND');
  const isOwner = table.workspace.ownerId === userId || table.createdById === userId;
  const perm = table.permissions.find((p) => p.userId === userId);
  if (!isOwner && !perm) throw new HttpError(403, '无权限', 'FORBIDDEN');
  return {
    table,
    role: isOwner ? 'OWNER' : perm!.role,
    canWrite: isOwner || perm!.role === 'EDITOR',
  };
}

function assertWrite(ctx: { canWrite: boolean }) {
  if (!ctx.canWrite) throw new HttpError(403, '只读权限', 'READONLY');
}

cliRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  }),
);

cliRouter.get(
  '/workspaces',
  asyncHandler(async (req, res) => {
    const workspaces = await prisma.workspace.findMany({
      where: { OR: [{ ownerId: req.user!.id }, { kind: 'PUBLIC' }] },
      orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({ workspaces });
  }),
);

cliRouter.get(
  '/docs',
  asyncHandler(async (req, res) => {
    const scope = z.enum(['mine', 'public', 'shared', 'all']).default('all').parse(req.query.scope ?? 'all');
    const q = z.string().trim().max(120).optional().parse(req.query.q || undefined);
    const limit = z.coerce.number().int().min(1).max(200).default(50).parse(req.query.limit ?? 50);
    const ownWorkspaces = await prisma.workspace.findMany({
      where: { ownerId: req.user!.id, kind: 'PRIVATE' },
      select: { id: true },
    });
    const publicWs = await prisma.workspace.findFirst({ where: { kind: 'PUBLIC' }, select: { id: true } });
    const where = {
      isArchived: false,
      deletedAt: null,
      ...(q ? { title: { contains: q } } : {}),
    };
    const queries = [];
    if (scope === 'mine' || scope === 'all') {
      queries.push(
        prisma.document.findMany({
          where: { ...where, workspaceId: { in: ownWorkspaces.map((w) => w.id) } },
          include: { workspace: true },
          orderBy: { updatedAt: 'desc' },
          take: limit,
        }),
      );
    }
    if ((scope === 'public' || scope === 'all') && publicWs) {
      queries.push(
        prisma.document.findMany({
          where: { ...where, workspaceId: publicWs.id },
          include: { workspace: true },
          orderBy: { updatedAt: 'desc' },
          take: limit,
        }),
      );
    }
    if (scope === 'shared' || scope === 'all') {
      queries.push(
        prisma.document.findMany({
          where: {
            ...where,
            permissions: { some: { userId: req.user!.id } },
            workspace: { ownerId: { not: req.user!.id }, kind: 'PRIVATE' },
          },
          include: { workspace: true },
          orderBy: { updatedAt: 'desc' },
          take: limit,
        }),
      );
    }
    const docs = (await Promise.all(queries))
      .flat()
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit)
      .map(withFolderFlag);
    res.json({ docs });
  }),
);

cliRouter.post(
  '/docs',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        workspaceId: z.string().optional(),
        workspaceKind: z.enum(['PRIVATE', 'PUBLIC']).optional(),
        parentId: z.string().nullable().optional(),
        title: z.string().trim().min(1).max(120).default('未命名文档'),
        contentJson: z.string().max(2_000_000).optional(),
        isFolder: z.boolean().optional(),
      })
      .parse(req.body);
    let ws;
    if (body.workspaceId) {
      ws = await prisma.workspace.findUnique({ where: { id: body.workspaceId } });
      if (!ws) throw new HttpError(404, '工作区不存在', 'NOT_FOUND');
      if (ws.kind === 'PRIVATE' && ws.ownerId !== req.user!.id) {
        throw new HttpError(403, '无权在此工作区创建文档', 'FORBIDDEN');
      }
    } else {
      ws = await findTargetWorkspace(req.user!.id, body.workspaceKind ?? 'PRIVATE');
    }
    const doc = await prisma.document.create({
      data: {
        workspaceId: ws.id,
        parentId: body.parentId ?? null,
        title: body.title,
        contentJson: body.isFolder ? FOLDER_CONTENT : body.contentJson ?? '',
        createdById: req.user!.id,
      },
    });
    res.json({ doc: withFolderFlag(doc) });
  }),
);

cliRouter.get(
  '/docs/:id',
  asyncHandler(async (req, res) => {
    const { doc, access } = await loadDocWithAccess(req.user!, req.params.id);
    res.json({ doc: withFolderFlag(doc), access });
  }),
);

cliRouter.patch(
  '/docs/:id',
  asyncHandler(async (req, res) => {
    const { doc, access } = await loadDocWithAccess(req.user!, req.params.id);
    if (!access.canWrite) throw new HttpError(403, '只读权限', 'READONLY');
    const body = z
      .object({
        title: z.string().trim().min(1).max(120).optional(),
        contentJson: z.string().max(2_000_000).optional(),
        parentId: z.string().nullable().optional(),
        isArchived: z.boolean().optional(),
      })
      .parse(req.body);
    const updated = await prisma.document.update({ where: { id: doc.id }, data: body });
    res.json({ doc: withFolderFlag(updated) });
  }),
);

cliRouter.delete(
  '/docs/:id',
  asyncHandler(async (req, res) => {
    const { doc, access } = await loadDocWithAccess(req.user!, req.params.id);
    if (!access.canDelete) throw new HttpError(403, '没有删除权限', 'FORBIDDEN');
    if (doc.workspace.kind === 'PUBLIC') {
      const now = new Date();
      const stack = [doc.id];
      const visited = new Set<string>();
      while (stack.length) {
        const currentId = stack.pop()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);
        const children = await prisma.document.findMany({
          where: { parentId: currentId, deletedAt: null },
          select: { id: true },
        });
        children.forEach((child) => stack.push(child.id));
        await prisma.document.updateMany({
          where: { id: currentId, deletedAt: null },
          data: { deletedAt: now, deletedById: req.user!.id },
        });
      }
    } else {
      await prisma.document.delete({ where: { id: doc.id } });
    }
    res.json({ ok: true });
  }),
);

cliRouter.get(
  '/tables',
  asyncHandler(async (req, res) => {
    const q = z.string().trim().max(120).optional().parse(req.query.q || undefined);
    const workspaces = await prisma.workspace.findMany({
      where: { ownerId: req.user!.id },
      select: { id: true },
    });
    const whereName = q ? { name: { contains: q } } : {};
    const [owned, shared] = await Promise.all([
      prisma.tableBase.findMany({
        where: { ...whereName, workspaceId: { in: workspaces.map((w) => w.id) } },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.tableBase.findMany({
        where: {
          ...whereName,
          permissions: { some: { userId: req.user!.id } },
          workspace: { ownerId: { not: req.user!.id } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    res.json({ tables: [...owned, ...shared] });
  }),
);

cliRouter.post(
  '/tables',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        workspaceId: z.string().optional(),
        name: z.string().trim().min(1).max(60),
        fields: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(40),
              type: z.enum(FIELD_TYPES).default('text'),
              options: z.record(z.any()).optional(),
            }),
          )
          .optional(),
        records: z.array(z.record(z.any())).max(5000).optional(),
      })
      .parse(req.body);
    const ws = body.workspaceId
      ? await prisma.workspace.findUnique({ where: { id: body.workspaceId } })
      : await findTargetWorkspace(req.user!.id, 'PRIVATE');
    if (!ws || ws.ownerId !== req.user!.id) throw new HttpError(403, '无权限', 'FORBIDDEN');
    const table = await prisma.tableBase.create({
      data: { workspaceId: ws.id, name: body.name, createdById: req.user!.id },
    });
    const fields = body.fields?.length ? body.fields : [{ name: '名称', type: 'text' as const }];
    await prisma.$transaction(
      fields.map((field, order) =>
        prisma.tableField.create({
          data: {
            tableId: table.id,
            name: field.name,
            type: field.type,
            options: JSON.stringify(field.options ?? {}),
            order,
          },
        }),
      ),
    );
    if (body.records?.length) {
      await prisma.$transaction(
        body.records.map((record, order) =>
          prisma.tableRecord.create({
            data: { tableId: table.id, dataJson: JSON.stringify(record), order },
          }),
        ),
      );
    }
    res.json({ table });
  }),
);

cliRouter.get(
  '/tables/:id',
  asyncHandler(async (req, res) => {
    const { table, role } = await loadTable(req.user!.id, req.params.id);
    const fields = await prisma.tableField.findMany({ where: { tableId: table.id }, orderBy: { order: 'asc' } });
    const records = await prisma.tableRecord.findMany({ where: { tableId: table.id }, orderBy: { order: 'asc' } });
    res.json({
      table,
      role,
      fields: fields.map((field) => ({ ...field, options: JSON.parse(field.options || '{}') })),
      records: records.map((record) => ({ ...record, data: JSON.parse(record.dataJson || '{}') })),
    });
  }),
);

cliRouter.patch(
  '/tables/:id',
  asyncHandler(async (req, res) => {
    const ctx = await loadTable(req.user!.id, req.params.id);
    assertWrite(ctx);
    const body = z.object({ name: z.string().trim().min(1).max(60).optional() }).parse(req.body);
    const table = await prisma.tableBase.update({ where: { id: ctx.table.id }, data: body });
    res.json({ table });
  }),
);

cliRouter.delete(
  '/tables/:id',
  asyncHandler(async (req, res) => {
    const ctx = await loadTable(req.user!.id, req.params.id);
    if (ctx.role !== 'OWNER') throw new HttpError(403, '只有所有者可以删除数据表', 'FORBIDDEN');
    await prisma.tableBase.delete({ where: { id: ctx.table.id } });
    res.json({ ok: true });
  }),
);

cliRouter.post(
  '/tables/:id/fields',
  asyncHandler(async (req, res) => {
    const ctx = await loadTable(req.user!.id, req.params.id);
    assertWrite(ctx);
    const body = z
      .object({
        name: z.string().trim().min(1).max(40),
        type: z.enum(FIELD_TYPES).default('text'),
        options: z.record(z.any()).optional(),
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

cliRouter.patch(
  '/tables/:id/fields/:fieldId',
  asyncHandler(async (req, res) => {
    const ctx = await loadTable(req.user!.id, req.params.id);
    assertWrite(ctx);
    const body = z
      .object({
        name: z.string().trim().min(1).max(40).optional(),
        options: z.record(z.any()).optional(),
      })
      .parse(req.body);
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

cliRouter.delete(
  '/tables/:id/fields/:fieldId',
  asyncHandler(async (req, res) => {
    const ctx = await loadTable(req.user!.id, req.params.id);
    assertWrite(ctx);
    await prisma.tableField.delete({ where: { id: req.params.fieldId } });
    res.json({ ok: true });
  }),
);

cliRouter.post(
  '/tables/:id/records',
  asyncHandler(async (req, res) => {
    const ctx = await loadTable(req.user!.id, req.params.id);
    assertWrite(ctx);
    const body = z.object({ data: z.record(z.any()).optional() }).parse(req.body);
    const order = await prisma.tableRecord.count({ where: { tableId: ctx.table.id } });
    const record = await prisma.tableRecord.create({
      data: { tableId: ctx.table.id, dataJson: JSON.stringify(body.data ?? {}), order },
    });
    res.json({ record: { ...record, data: JSON.parse(record.dataJson) } });
  }),
);

cliRouter.patch(
  '/tables/:id/records/:recordId',
  asyncHandler(async (req, res) => {
    const ctx = await loadTable(req.user!.id, req.params.id);
    assertWrite(ctx);
    const body = z.object({ data: z.record(z.any()) }).parse(req.body);
    const record = await prisma.tableRecord.update({
      where: { id: req.params.recordId },
      data: { dataJson: JSON.stringify(body.data) },
    });
    res.json({ record: { ...record, data: JSON.parse(record.dataJson) } });
  }),
);

cliRouter.delete(
  '/tables/:id/records/:recordId',
  asyncHandler(async (req, res) => {
    const ctx = await loadTable(req.user!.id, req.params.id);
    assertWrite(ctx);
    await prisma.tableRecord.delete({ where: { id: req.params.recordId } });
    res.json({ ok: true });
  }),
);
