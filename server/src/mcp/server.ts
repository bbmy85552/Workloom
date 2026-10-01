import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import type { AuthedUser } from '../middleware/auth.js';
import { computeAccess, loadDocWithAccess } from '../lib/docAccess.js';
import { HttpError } from '../lib/asyncHandler.js';

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

const FieldTypeSchema = z.enum(FIELD_TYPES);

function jsonContent(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

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

export function createDocsPlatformMcpServer(user: AuthedUser) {
  const server = new McpServer({
    name: 'docs-platform',
    version: '0.1.0',
  });

  server.registerTool(
    'docs_platform_me',
    {
      title: 'Current User',
      description: 'Return the authenticated docs-platform user for this API key.',
    },
    async () => jsonContent({ user }),
  );

  server.registerTool(
    'docs_list',
    {
      title: 'List Documents',
      description: 'List accessible documents in docs-platform.',
      inputSchema: {
        scope: z.enum(['mine', 'public', 'shared', 'all']).default('all'),
        q: z.string().max(120).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      },
    },
    async ({ scope, q, limit }) => {
      const ownWorkspaces = await prisma.workspace.findMany({
        where: { ownerId: user.id, kind: 'PRIVATE' },
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
              permissions: { some: { userId: user.id } },
              workspace: { ownerId: { not: user.id }, kind: 'PRIVATE' },
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
      return jsonContent({ docs });
    },
  );

  server.registerTool(
    'docs_get',
    {
      title: 'Get Document',
      description: 'Get one document by id.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const { doc, access } = await loadDocWithAccess(user, id);
      return jsonContent({ doc: withFolderFlag(doc), access });
    },
  );

  server.registerTool(
    'docs_create',
    {
      title: 'Create Document',
      description: 'Create a document or folder.',
      inputSchema: {
        title: z.string().min(1).max(120),
        contentJson: z.string().max(2_000_000).optional(),
        workspaceId: z.string().optional(),
        workspaceKind: z.enum(['PRIVATE', 'PUBLIC']).optional(),
        parentId: z.string().nullable().optional(),
        isFolder: z.boolean().optional(),
      },
    },
    async ({ title, contentJson, workspaceId, workspaceKind, parentId, isFolder }) => {
      const ws = workspaceId
        ? await prisma.workspace.findUnique({ where: { id: workspaceId } })
        : await findTargetWorkspace(user.id, workspaceKind ?? 'PRIVATE');
      if (!ws) throw new HttpError(404, '工作区不存在', 'NOT_FOUND');
      if (ws.kind === 'PRIVATE' && ws.ownerId !== user.id) {
        throw new HttpError(403, '无权在此工作区创建文档', 'FORBIDDEN');
      }
      const doc = await prisma.document.create({
        data: {
          workspaceId: ws.id,
          parentId: parentId ?? null,
          title,
          contentJson: isFolder ? FOLDER_CONTENT : contentJson ?? '',
          createdById: user.id,
        },
      });
      return jsonContent({ doc: withFolderFlag(doc) });
    },
  );

  server.registerTool(
    'docs_update',
    {
      title: 'Update Document',
      description: 'Update document title, content, parent, or archive status.',
      inputSchema: {
        id: z.string(),
        title: z.string().min(1).max(120).optional(),
        contentJson: z.string().max(2_000_000).optional(),
        parentId: z.string().nullable().optional(),
        isArchived: z.boolean().optional(),
      },
    },
    async ({ id, title, contentJson, parentId, isArchived }) => {
      const { doc, access } = await loadDocWithAccess(user, id);
      if (!access.canWrite) throw new HttpError(403, '只读权限', 'READONLY');
      const updated = await prisma.document.update({
        where: { id: doc.id },
        data: { title, contentJson, parentId, isArchived },
      });
      return jsonContent({ doc: withFolderFlag(updated) });
    },
  );

  server.registerTool(
    'docs_delete',
    {
      title: 'Delete Document',
      description: 'Delete a private document or move a public document subtree to trash.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const { doc, access } = await loadDocWithAccess(user, id);
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
            data: { deletedAt: now, deletedById: user.id },
          });
        }
      } else {
        await prisma.document.delete({ where: { id: doc.id } });
      }
      return jsonContent({ ok: true });
    },
  );

  server.registerTool(
    'tables_list',
    {
      title: 'List Tables',
      description: 'List accessible data tables.',
      inputSchema: { q: z.string().max(120).optional() },
    },
    async ({ q }) => {
      const workspaces = await prisma.workspace.findMany({ where: { ownerId: user.id }, select: { id: true } });
      const whereName = q ? { name: { contains: q } } : {};
      const [owned, shared] = await Promise.all([
        prisma.tableBase.findMany({
          where: { ...whereName, workspaceId: { in: workspaces.map((w) => w.id) } },
          orderBy: { updatedAt: 'desc' },
        }),
        prisma.tableBase.findMany({
          where: {
            ...whereName,
            permissions: { some: { userId: user.id } },
            workspace: { ownerId: { not: user.id } },
          },
          orderBy: { updatedAt: 'desc' },
        }),
      ]);
      return jsonContent({ tables: [...owned, ...shared] });
    },
  );

  server.registerTool(
    'tables_get',
    {
      title: 'Get Table',
      description: 'Get table fields and records.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const { table, role } = await loadTable(user.id, id);
      const fields = await prisma.tableField.findMany({ where: { tableId: table.id }, orderBy: { order: 'asc' } });
      const records = await prisma.tableRecord.findMany({ where: { tableId: table.id }, orderBy: { order: 'asc' } });
      return jsonContent({
        table,
        role,
        fields: fields.map((field) => ({ ...field, options: JSON.parse(field.options || '{}') })),
        records: records.map((record) => ({ ...record, data: JSON.parse(record.dataJson || '{}') })),
      });
    },
  );

  server.registerTool(
    'tables_create',
    {
      title: 'Create Table',
      description: 'Create a data table with optional fields and records.',
      inputSchema: {
        name: z.string().min(1).max(60),
        workspaceId: z.string().optional(),
        fields: z
          .array(z.object({ name: z.string().min(1).max(40), type: FieldTypeSchema.default('text'), options: z.record(z.any()).optional() }))
          .optional(),
        records: z.array(z.record(z.any())).max(5000).optional(),
      },
    },
    async ({ name, workspaceId, fields, records }) => {
      const ws = workspaceId
        ? await prisma.workspace.findUnique({ where: { id: workspaceId } })
        : await findTargetWorkspace(user.id, 'PRIVATE');
      if (!ws || ws.ownerId !== user.id) throw new HttpError(403, '无权限', 'FORBIDDEN');
      const table = await prisma.tableBase.create({ data: { workspaceId: ws.id, name, createdById: user.id } });
      const nextFields = fields?.length ? fields : [{ name: '名称', type: 'text' as const }];
      await prisma.$transaction(
        nextFields.map((field, order) =>
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
      if (records?.length) {
        await prisma.$transaction(
          records.map((record, order) =>
            prisma.tableRecord.create({ data: { tableId: table.id, dataJson: JSON.stringify(record), order } }),
          ),
        );
      }
      return jsonContent({ table });
    },
  );

  server.registerTool(
    'tables_update',
    {
      title: 'Update Table',
      description: 'Rename a data table.',
      inputSchema: { id: z.string(), name: z.string().min(1).max(60) },
    },
    async ({ id, name }) => {
      const ctx = await loadTable(user.id, id);
      assertWrite(ctx);
      const table = await prisma.tableBase.update({ where: { id: ctx.table.id }, data: { name } });
      return jsonContent({ table });
    },
  );

  server.registerTool(
    'tables_delete',
    {
      title: 'Delete Table',
      description: 'Delete a data table. Only the owner can delete a table.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const ctx = await loadTable(user.id, id);
      if (ctx.role !== 'OWNER') throw new HttpError(403, '只有所有者可以删除数据表', 'FORBIDDEN');
      await prisma.tableBase.delete({ where: { id: ctx.table.id } });
      return jsonContent({ ok: true });
    },
  );

  server.registerTool(
    'table_fields_create',
    {
      title: 'Create Table Field',
      description: 'Create a field on a data table.',
      inputSchema: {
        tableId: z.string(),
        name: z.string().min(1).max(40),
        type: FieldTypeSchema.default('text'),
        options: z.record(z.any()).optional(),
      },
    },
    async ({ tableId, name, type, options }) => {
      const ctx = await loadTable(user.id, tableId);
      assertWrite(ctx);
      const order = await prisma.tableField.count({ where: { tableId: ctx.table.id } });
      const field = await prisma.tableField.create({
        data: { tableId: ctx.table.id, name, type, options: JSON.stringify(options ?? {}), order },
      });
      return jsonContent({ field: { ...field, options: JSON.parse(field.options) } });
    },
  );

  server.registerTool(
    'table_fields_update',
    {
      title: 'Update Table Field',
      description: 'Update a field name or options.',
      inputSchema: {
        tableId: z.string(),
        fieldId: z.string(),
        name: z.string().min(1).max(40).optional(),
        options: z.record(z.any()).optional(),
      },
    },
    async ({ tableId, fieldId, name, options }) => {
      const ctx = await loadTable(user.id, tableId);
      assertWrite(ctx);
      const field = await prisma.tableField.update({
        where: { id: fieldId },
        data: { name, options: options === undefined ? undefined : JSON.stringify(options) },
      });
      return jsonContent({ field: { ...field, options: JSON.parse(field.options) } });
    },
  );

  server.registerTool(
    'table_fields_delete',
    {
      title: 'Delete Table Field',
      description: 'Delete a field from a data table.',
      inputSchema: { tableId: z.string(), fieldId: z.string() },
    },
    async ({ tableId, fieldId }) => {
      const ctx = await loadTable(user.id, tableId);
      assertWrite(ctx);
      await prisma.tableField.delete({ where: { id: fieldId } });
      return jsonContent({ ok: true });
    },
  );

  server.registerTool(
    'table_records_create',
    {
      title: 'Create Table Record',
      description: 'Create a record in a data table.',
      inputSchema: { tableId: z.string(), data: z.record(z.any()).optional() },
    },
    async ({ tableId, data }) => {
      const ctx = await loadTable(user.id, tableId);
      assertWrite(ctx);
      const order = await prisma.tableRecord.count({ where: { tableId: ctx.table.id } });
      const record = await prisma.tableRecord.create({
        data: { tableId: ctx.table.id, dataJson: JSON.stringify(data ?? {}), order },
      });
      return jsonContent({ record: { ...record, data: JSON.parse(record.dataJson) } });
    },
  );

  server.registerTool(
    'table_records_update',
    {
      title: 'Update Table Record',
      description: 'Replace a table record data object.',
      inputSchema: { tableId: z.string(), recordId: z.string(), data: z.record(z.any()) },
    },
    async ({ tableId, recordId, data }) => {
      const ctx = await loadTable(user.id, tableId);
      assertWrite(ctx);
      const record = await prisma.tableRecord.update({
        where: { id: recordId },
        data: { dataJson: JSON.stringify(data) },
      });
      return jsonContent({ record: { ...record, data: JSON.parse(record.dataJson) } });
    },
  );

  server.registerTool(
    'table_records_delete',
    {
      title: 'Delete Table Record',
      description: 'Delete a table record.',
      inputSchema: { tableId: z.string(), recordId: z.string() },
    },
    async ({ tableId, recordId }) => {
      const ctx = await loadTable(user.id, tableId);
      assertWrite(ctx);
      await prisma.tableRecord.delete({ where: { id: recordId } });
      return jsonContent({ ok: true });
    },
  );

  return server;
}
