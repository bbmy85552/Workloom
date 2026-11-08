import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import type { AuthedUser } from '../middleware/auth.js';
import { computeAccess, loadDocWithAccess } from '../lib/docAccess.js';
import { HttpError } from '../lib/asyncHandler.js';
import { MEMORY_MCP_INSTRUCTIONS, registerMemoryTools } from './memoryTools.js';
import {
  aggregateSessionsByUser,
  assertReadingAdmin,
  countReadLinksByUser,
  getLiveTimelineLinks,
  listReadingUsers,
} from '../lib/readingStats.js';
import { isValidDateString } from '../lib/dailyPicks.js';
import {
  assertWorkspaceWritable,
  canWriteHtml,
  extractUpload,
  loadHtmlPreview,
  previewDir,
  removePreviewDir,
} from '../lib/htmlPreview.js';
import type { LiveTimelineLink, SessionAgg } from '../lib/readingStats.js';
import { env } from '../env.js';

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

// MCP 一律只给链接、不返回正文/HTML 源码：文档与 HTML 的正文都不进模型上下文。
const BASE_URL = env.APP_URL.replace(/\/+$/, '');

function stripDocBody<T extends { contentJson?: string | null }>(doc: T): Omit<T, 'contentJson'> {
  const copy = { ...doc };
  delete copy.contentJson;
  return copy;
}

// 取某资源现有有效的仅查看分享链接（未撤销、未过期；多条取最新的一条）。
async function findLatestViewShareLink(resourceType: string, resourceId: string) {
  const now = new Date();
  return prisma.shareLink.findFirst({
    where: {
      resourceType,
      resourceId,
      role: 'view',
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: 'desc' },
  });
}

// 照分享页 SharePage.tsx 拼 iframe src 的方式拼 HTML 文件地址。
function buildHtmlFileUrl(preview: { id: string; entryPath: string }, token: string | null) {
  const path = preview.entryPath
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  const url = `${BASE_URL}/api/html-previews/${preview.id}/files/${path}`;
  return token ? `${url}?token=${token}` : url;
}

function htmlBaseNameNoExt(name: string): string {
  const base = name.split('/').pop() ?? name;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

// HTML 的链接拼法：有有效仅查看分享链接就带 token，否则 fileUrl 不带 token、shareUrl 为 null 并加 note
//（与 html_get 无链接分支一致；上传不自动创建分享链接）。
async function htmlLinks(preview: { id: string; entryPath: string }) {
  const link = await findLatestViewShareLink('html', preview.id);
  const token = link ? link.token : null;
  return {
    fileUrl: buildHtmlFileUrl(preview, token),
    shareUrl: token ? `${BASE_URL}/share/${token}` : null,
    ...(token
      ? {}
      : {
          note: '该 HTML 暂无有效的仅查看分享链接，fileUrl 未带 token；文件接口也接受登录态，但 MCP 调用方一般没有登录态，请先在站内为它创建一个仅查看分享链接。',
        }),
  };
}

// 照网页上传路由（POST /api/html-previews）的工作区解析规则：parentId 优先（取父文件夹所在工作区），
// 其次 workspaceId，再按 workspaceKind（PUBLIC 取公共库，PRIVATE 取调用者最早的私人空间）；
// 三者都不传时默认调用者私人空间根目录，与 docs_create 的默认值一致。
async function resolveHtmlUploadWorkspace(
  user: AuthedUser,
  opts: { parentId?: string; workspaceId?: string; workspaceKind?: 'PUBLIC' | 'PRIVATE' },
) {
  if (opts.parentId) {
    const parent = await prisma.document.findUnique({
      where: { id: opts.parentId },
      include: { workspace: true },
    });
    if (!parent || parent.deletedAt || parent.isArchived) {
      throw new HttpError(400, '父文件夹不存在', 'BAD_PARENT');
    }
    return { ws: parent.workspace, parentId: parent.id };
  }
  if (opts.workspaceId) {
    const ws = await prisma.workspace.findUnique({ where: { id: opts.workspaceId } });
    if (!ws) throw new HttpError(404, '工作区不存在', 'NOT_FOUND');
    return { ws, parentId: null as string | null };
  }
  const ws = await findTargetWorkspace(user.id, opts.workspaceKind ?? 'PRIVATE');
  return { ws, parentId: null as string | null };
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

async function assertRecordInTable(tableId: string, recordId: string) {
  const record = await prisma.tableRecord.findFirst({ where: { id: recordId, tableId }, select: { id: true } });
  if (!record) throw new HttpError(404, '记录不存在', 'RECORD_NOT_FOUND');
}

async function assertFieldInTable(tableId: string, fieldId: string) {
  const field = await prisma.tableField.findFirst({ where: { id: fieldId, tableId }, select: { id: true } });
  if (!field) throw new HttpError(404, '字段不存在', 'FIELD_NOT_FOUND');
}

export function createDocsPlatformMcpServer(user: AuthedUser) {
  const server = new McpServer(
    {
      name: 'docs-platform',
      version: '0.1.0',
    },
    { instructions: MEMORY_MCP_INSTRUCTIONS },
  );

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
      description: 'List accessible documents in docs-platform. Returns metadata only, never document bodies.',
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
        .map(withFolderFlag)
        .map(stripDocBody);
      return jsonContent({ docs });
    },
  );

  server.registerTool(
    'docs_get',
    {
      title: 'Get Document',
      description: 'Get one document by id. Returns metadata and links only, never the document body.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const { doc, access } = await loadDocWithAccess(user, id);
      const link = await findLatestViewShareLink('doc', id);
      const shareUrl = link ? `${BASE_URL}/share/${link.token}` : null;
      const links = { shareUrl, appUrl: `${BASE_URL}/app/docs/${id}` };
      return jsonContent({
        doc: stripDocBody(withFolderFlag(doc)),
        links,
        access,
        ...(shareUrl
          ? {}
          : { note: '暂无有效的仅查看分享链接，请登录后打开站内地址查看。' }),
      });
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
      await assertFieldInTable(ctx.table.id, fieldId);
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
      await assertFieldInTable(ctx.table.id, fieldId);
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
      await assertRecordInTable(ctx.table.id, recordId);
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
      await assertRecordInTable(ctx.table.id, recordId);
      await prisma.tableRecord.delete({ where: { id: recordId } });
      return jsonContent({ ok: true });
    },
  );

  server.registerTool(
    'reading_article_status',
    {
      title: 'Daily Picks Article Read Status',
      description:
        'Admin only. For one Daily Picks article (by title keyword or share link id), list who has read it and who has not. Read means the user opened the link at least once. Only articles actually featured on the Daily Picks timeline are considered.',
      inputSchema: {
        article: z.string().trim().min(1).max(200),
      },
    },
    async ({ article }) => {
      assertReadingAdmin(user);
      const links = await getLiveTimelineLinks();
      const keyword = article.toLowerCase();
      let target: LiveTimelineLink | undefined = links.find((l) => l.id === article);
      if (!target) {
        const exact = links.filter((l) => l.title.trim().toLowerCase() === keyword);
        if (exact.length === 1) {
          target = exact[0];
        } else {
          const matched = exact.length > 1 ? exact : links.filter((l) => l.title.toLowerCase().includes(keyword));
          if (matched.length === 0) {
            return jsonContent({
              error: 'NOT_FOUND',
              message: `没有找到标题包含「${article}」的每日精选文章`,
              liveArticles: links.map((l) => ({ linkId: l.id, title: l.title, resourceType: l.resourceType })),
            });
          }
          if (matched.length > 1) {
            return jsonContent({
              error: 'AMBIGUOUS',
              message: `标题包含「${article}」的每日精选文章有 ${matched.length} 篇，请用 linkId 指定一篇`,
              candidates: matched.map((l) => ({ linkId: l.id, title: l.title, resourceType: l.resourceType })),
            });
          }
          target = matched[0];
        }
      }
      if (!target) throw new HttpError(404, '没有找到对应的每日精选文章', 'NOT_FOUND');
      const users = await listReadingUsers();
      const aggByUser = await aggregateSessionsByUser([target.id]);
      const toAggJson = (agg: SessionAgg) => ({
        visits: agg.visits,
        visibleSec: agg.visibleSec,
        activeSec: agg.activeSec,
        scrollSec: agg.scrollSec,
        maxScrollDepth: agg.maxScrollDepth,
        lastSeenAt: agg.lastSeenAt.toISOString(),
      });
      const read = users
        .filter((u) => aggByUser.has(u.id))
        .map((u) => ({ id: u.id, name: u.name, company: u.company, email: u.email, agg: toAggJson(aggByUser.get(u.id)!) }));
      const unread = users
        .filter((u) => !aggByUser.has(u.id))
        .map((u) => ({ id: u.id, name: u.name, company: u.company, email: u.email, agg: null }));
      return jsonContent({
        article: {
          id: target.id,
          title: target.title,
          resourceType: target.resourceType,
          createdAt: target.createdAt.toISOString(),
          creatorName: target.creatorName,
        },
        totalUsers: users.length,
        readCount: read.length,
        unreadCount: unread.length,
        read,
        unread,
      });
    },
  );

  server.registerTool(
    'reading_user_completion',
    {
      title: 'Daily Picks Reading Completion by User',
      description:
        'Admin only. For every user, the share of featured Daily Picks articles they have opened (read means at least one view session on the article link). Denominator: only articles actually featured on the Daily Picks timeline. Optional company filters by company name.',
      inputSchema: {
        company: z.string().trim().max(100).optional(),
      },
    },
    async ({ company }) => {
      assertReadingAdmin(user);
      const links = await getLiveTimelineLinks();
      const totalLinks = links.length;
      const users = await listReadingUsers();
      const filtered = company ? users.filter((u) => u.company === company) : users;
      const readCounts = await countReadLinksByUser(links.map((l) => l.id));
      const rows = filtered
        .map((u) => {
          const readCount = readCounts.get(u.id) ?? 0;
          const percentage = totalLinks === 0 ? 0 : Math.round((readCount / totalLinks) * 1000) / 10;
          return { name: u.name, company: u.company, email: u.email, readCount, totalLinks, percentage };
        })
        .sort((a, b) => {
          if (b.percentage !== a.percentage) return b.percentage - a.percentage;
          return a.name.localeCompare(b.name);
        });
      return jsonContent({
        denominator: {
          totalLinks,
          note: '只算每日精选时间线里实际放出的文章（已撤销、过期或未进时间线的链接不计）',
        },
        users: rows,
      });
    },
  );

  server.registerTool(
    'html_list',
    {
      title: 'List HTML Previews',
      description:
        'Admin only. List HTML previews in the knowledge base. Returns metadata only (id, title, entryPath, createdAt), never the HTML source.',
      inputSchema: {
        q: z.string().max(120).optional(),
      },
    },
    async ({ q }) => {
      assertReadingAdmin(user);
      const previews = await prisma.htmlPreview.findMany({
        where: { deletedAt: null, ...(q ? { title: { contains: q } } : {}) },
        select: { id: true, title: true, entryPath: true, createdAt: true },
        orderBy: { updatedAt: 'desc' },
      });
      return jsonContent({
        htmlPreviews: previews.map((p) => ({
          id: p.id,
          title: p.title,
          entryPath: p.entryPath,
          createdAt: p.createdAt.toISOString(),
        })),
      });
    },
  );

  server.registerTool(
    'html_get',
    {
      title: 'Get HTML Preview',
      description:
        'Admin only. Get one HTML preview by id or title keyword. Returns metadata and links only (fileUrl, shareUrl), never the HTML source.',
      inputSchema: {
        html: z.string().trim().min(1).max(200),
      },
    },
    async ({ html }) => {
      assertReadingAdmin(user);
      const previews = await prisma.htmlPreview.findMany({
        where: { deletedAt: null },
        select: { id: true, title: true, entryPath: true, createdAt: true },
        orderBy: { updatedAt: 'desc' },
      });
      const keyword = html.toLowerCase();
      let target: (typeof previews)[number] | undefined = previews.find((p) => p.id === html);
      if (!target) {
        const exact = previews.filter((p) => p.title.trim().toLowerCase() === keyword);
        if (exact.length === 1) {
          target = exact[0];
        } else {
          const matched = exact.length > 1 ? exact : previews.filter((p) => p.title.toLowerCase().includes(keyword));
          if (matched.length === 0) {
            return jsonContent({
              error: 'NOT_FOUND',
              message: `没有找到标题包含「${html}」的 HTML 预览`,
              htmlPreviews: previews.map((p) => ({ linkId: p.id, title: p.title })),
            });
          }
          if (matched.length > 1) {
            return jsonContent({
              error: 'AMBIGUOUS',
              message: `标题包含「${html}」的 HTML 预览有 ${matched.length} 篇，请用 id 指定一篇`,
              candidates: matched.map((p) => ({ linkId: p.id, title: p.title })),
            });
          }
          target = matched[0];
        }
      }
      if (!target) throw new HttpError(404, '没有找到对应的 HTML 预览', 'NOT_FOUND');
      const link = await findLatestViewShareLink('html', target.id);
      const token = link ? link.token : null;
      const fileUrl = buildHtmlFileUrl(target, token);
      const shareUrl = token ? `${BASE_URL}/share/${token}` : null;
      return jsonContent({
        id: target.id,
        title: target.title,
        entryPath: target.entryPath,
        fileUrl,
        shareUrl,
        ...(token
          ? {}
          : {
              note: '该 HTML 暂无有效的仅查看分享链接，fileUrl 未带 token；文件接口也接受登录态，但 MCP 调用方一般没有登录态，请先在站内为它创建一个仅查看分享链接。',
            }),
      });
    },
  );

  server.registerTool(
    'html_upload',
    {
      title: 'Upload HTML Preview',
      description:
        'Upload an HTML page as a new HTML preview in the knowledge base: either a single .html/.htm file (html = content string) or a .zip bundle (zipBase64 = base64-encoded zip, unpacked with the same rules as web upload). Open to all logged-in users. Returns metadata and links only (fileUrl, shareUrl, appUrl), never the HTML source. Does not create a share link.',
      inputSchema: {
        title: z.string().trim().min(1).max(100).optional(),
        html: z.string().min(1).max(5_000_000).optional(),
        zipBase64: z.string().min(1).max(14_000_000).optional(),
        filename: z.string().trim().min(1).max(200).optional(),
        entryPath: z.string().trim().min(1).max(500).optional(),
        parentId: z.string().min(1).max(100).optional(),
        workspaceId: z.string().optional(),
        workspaceKind: z.enum(['PUBLIC', 'PRIVATE']).optional(),
      },
    },
    async ({ title, html, zipBase64, filename, entryPath, parentId, workspaceId, workspaceKind }) => {
      const hasHtml = typeof html === 'string' && html.length > 0;
      const hasZip = typeof zipBase64 === 'string' && zipBase64.length > 0;
      if (hasHtml === hasZip) {
        throw new HttpError(
          400,
          'html 与 zipBase64 二选一：传一个 .html/.htm 内容字符串，或传一个 .zip 的 base64',
          'BAD_INPUT',
        );
      }
      if (hasZip && !/^[A-Za-z0-9+/=\r\n]+$/.test(zipBase64 as string)) {
        throw new HttpError(400, 'zipBase64 不是有效的 base64', 'BAD_INPUT');
      }
      const name = (filename ?? (hasZip ? 'upload.zip' : 'index.html')).trim();
      const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
      if (hasHtml && ext !== '.html' && ext !== '.htm') {
        throw new HttpError(400, '传 html 内容时文件名须以 .html 或 .htm 结尾', 'BAD_TYPE');
      }
      if (hasZip && ext !== '.zip') {
        throw new HttpError(400, '传 zipBase64 时文件名须以 .zip 结尾', 'BAD_TYPE');
      }
      const buffer = hasZip
        ? Buffer.from(zipBase64 as string, 'base64')
        : Buffer.from(html as string, 'utf-8');
      if (buffer.length === 0) throw new HttpError(400, '上传内容为空', 'EMPTY_UPLOAD');
      const { ws, parentId: resolvedParentId } = await resolveHtmlUploadWorkspace(user, {
        parentId,
        workspaceId,
        workspaceKind,
      });
      assertWorkspaceWritable(user, ws);
      const preview = await prisma.htmlPreview.create({
        data: {
          workspaceId: ws.id,
          parentId: resolvedParentId,
          createdById: user.id,
          title: title || htmlBaseNameNoExt(name),
          entryPath: '',
        },
      });
      try {
        const result = await extractUpload(buffer, name, previewDir(preview.id), entryPath);
        const updated = await prisma.htmlPreview.update({
          where: { id: preview.id },
          data: { entryPath: result.entryPath, fileCount: result.files.length, totalSize: result.totalSize },
        });
        const links = await htmlLinks(updated);
        return jsonContent({
          id: updated.id,
          title: updated.title,
          entryPath: updated.entryPath,
          fileCount: updated.fileCount,
          totalSize: updated.totalSize,
          workspaceKind: ws.kind,
          appUrl: `${BASE_URL}/app/html/${updated.id}`,
          ...links,
        });
      } catch (err) {
        await prisma.htmlPreview.delete({ where: { id: preview.id } }).catch(() => undefined);
        await removePreviewDir(preview.id);
        throw err;
      }
    },
  );

  server.registerTool(
    'html_delete',
    {
      title: 'Delete HTML Preview',
      description:
        'Move an HTML preview to trash (soft delete, restorable from the web trash). Only the creator or an admin can delete.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const preview = await loadHtmlPreview(id);
      if (!canWriteHtml(user, preview)) throw new HttpError(403, '无权限', 'FORBIDDEN');
      if (preview.deletedAt) throw new HttpError(404, 'HTML 预览不存在', 'NOT_FOUND');
      const deleted = await prisma.htmlPreview.update({
        where: { id: preview.id },
        data: { deletedAt: new Date(), deletedById: user.id },
      });
      return jsonContent({
        ok: true,
        id: deleted.id,
        title: deleted.title,
        deletedAt: deleted.deletedAt?.toISOString() ?? null,
      });
    },
  );

  server.registerTool(
    'html_update',
    {
      title: 'Rename HTML Preview',
      description:
        'Rename an HTML preview (title only; the HTML content is never changed here — to change content, delete it and upload a new one). Only the creator or an admin can rename.',
      inputSchema: {
        id: z.string(),
        title: z.string().trim().min(1).max(100),
      },
    },
    async ({ id, title }) => {
      const preview = await loadHtmlPreview(id);
      if (!canWriteHtml(user, preview)) throw new HttpError(403, '无权限', 'FORBIDDEN');
      if (preview.deletedAt) throw new HttpError(404, 'HTML 预览不存在', 'NOT_FOUND');
      const updated = await prisma.htmlPreview.update({
        where: { id: preview.id },
        data: { title },
      });
      const links = await htmlLinks(updated);
      return jsonContent({
        id: updated.id,
        title: updated.title,
        entryPath: updated.entryPath,
        fileCount: updated.fileCount,
        totalSize: updated.totalSize,
        appUrl: `${BASE_URL}/app/html/${updated.id}`,
        ...links,
      });
    },
  );

  server.registerTool(
    'daily_picks_list',
    {
      title: 'Daily Picks Timeline',
      description:
        'List articles featured on the Daily Picks timeline (docs, tables and HTML previews). Open to all logged-in users. Returns metadata and links only, never body content.',
      inputSchema: {
        date: z.string().trim().min(1).max(10).optional(),
        q: z.string().trim().min(1).max(200).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async ({ date, q, limit }) => {
      if (date && !isValidDateString(date)) {
        return jsonContent({
          error: 'BAD_DATE',
          message: '日期格式应为 YYYY-MM-DD（北京时间）',
        });
      }
      const links = await getLiveTimelineLinks();
      const sorted = [...links].sort((a, b) => {
        if (a.featuredDate !== b.featuredDate) return b.featuredDate.localeCompare(a.featuredDate);
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
      let filtered = sorted;
      if (date) filtered = filtered.filter((l) => l.featuredDate === date);
      if (q) {
        const keyword = q.toLowerCase();
        filtered = filtered.filter((l) => l.title.toLowerCase().includes(keyword));
      }
      const total = filtered.length;
      const page = filtered.slice(0, limit ?? 50);
      const htmlIds = [...new Set(page.filter((l) => l.resourceType === 'html').map((l) => l.resourceId))];
      const entryById = new Map<string, string>();
      if (htmlIds.length > 0) {
        const previews = await prisma.htmlPreview.findMany({
          where: { id: { in: htmlIds }, deletedAt: null },
          select: { id: true, entryPath: true },
        });
        for (const p of previews) entryById.set(p.id, p.entryPath);
      }
      const appPath = (resourceType: string, resourceId: string) =>
        resourceType === 'doc'
          ? `/app/docs/${resourceId}`
          : resourceType === 'table'
            ? `/app/tables/${resourceId}`
            : `/app/html/${resourceId}`;
      const picks = page.map((l) => {
        const shareUrl = `${BASE_URL}/share/${l.token}`;
        const entryPath = entryById.get(l.resourceId);
        return {
          pickId: l.pickId,
          date: l.featuredDate,
          title: l.title,
          resourceType: l.resourceType,
          linkId: l.id,
          fileUrl:
            l.resourceType === 'html' && entryPath
              ? buildHtmlFileUrl({ id: l.resourceId, entryPath }, l.token)
              : null,
          shareUrl,
          appUrl: `${BASE_URL}${appPath(l.resourceType, l.resourceId)}`,
        };
      });
      return jsonContent({ total, picks });
    },
  );

  registerMemoryTools(server, user);

  return server;
}
