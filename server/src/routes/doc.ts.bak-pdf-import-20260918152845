import { Router } from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireEmailVerified } from '../middleware/requireEmailVerified.js';
import {
  resolveExistingUploadPath,
  resolveUploadPath,
  storeUploadBuffer,
  uploadDocImport,
} from '../lib/upload.js';
import { importByExtension } from '../lib/textImport.js';
import { computeAccess, loadDocWithAccess } from '../lib/docAccess.js';
import { htmlToDocx, htmlToFullPage, htmlToMarkdown } from '../lib/export.js';
import { contentDispositionAttachment, normalizeFilename } from '../lib/filename.js';

export const docRouter = Router();
docRouter.use(requireAuth, requireEmailVerified);

const ATTACHMENT_RAW_RE = /\/api\/attachments\/([^/?#]+)\/raw/g;
const FOLDER_CONTENT = '<div data-jianji-type="folder"></div>';

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

async function copyDocumentAttachments(sourceDocumentId: string, targetDocumentId: string, userId: string) {
  const attachments = await prisma.attachment.findMany({ where: { documentId: sourceDocumentId } });
  const idMap = new Map<string, string>();
  for (const attachment of attachments) {
    const sourcePath = resolveExistingUploadPath(attachment.storedName);
    if (!sourcePath || !fs.existsSync(sourcePath)) continue;
    const buffer = await fs.promises.readFile(sourcePath);
    const stored = await storeUploadBuffer(buffer, {
      subdir: 'attachments',
      originalName: attachment.originalName,
    });
    const copied = await prisma.attachment.create({
      data: {
        ownerId: userId,
        documentId: targetDocumentId,
        tableId: null,
        category: attachment.category,
        originalName: attachment.originalName,
        storedName: stored.storedName,
        mimeType: attachment.mimeType,
        size: attachment.size,
      },
    });
    idMap.set(attachment.id, copied.id);
  }
  return idMap;
}

function rewriteAttachmentLinks(contentJson: string, idMap: Map<string, string>) {
  if (idMap.size === 0) return contentJson;
  return contentJson.replace(ATTACHMENT_RAW_RE, (full, id: string) => {
    const nextId = idMap.get(id);
    return nextId ? `/api/attachments/${nextId}/raw` : full;
  });
}

docRouter.get(
  '/tree',
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const ownWorkspaces = await prisma.workspace.findMany({
      where: { ownerId: req.user!.id, kind: 'PRIVATE' },
      orderBy: { createdAt: 'asc' },
    });
    const publicWs = await prisma.workspace.findFirst({ where: { kind: 'PUBLIC' } });
    const wsIds = ownWorkspaces.map((w) => w.id);

    const favoritesRel = await prisma.documentFavorite.findMany({
      where: { userId: req.user!.id, document: { isArchived: false, deletedAt: null } },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            parentId: true,
            workspaceId: true,
            contentJson: true,
            updatedAt: true,
            createdById: true,
            workspace: { select: { id: true, name: true, kind: true, ownerId: true } },
            createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const favorites = favoritesRel.filter((f) => f.document).map((f) => ({
      ...withFolderFlag(f.document!),
      favoritedAt: f.createdAt,
    }));
    const favoriteIds = new Set(favorites.map((f) => f.id));

    const mineDocs = await prisma.document.findMany({
      where: { workspaceId: { in: wsIds }, isArchived: false, deletedAt: null },
      select: { id: true, title: true, parentId: true, workspaceId: true, contentJson: true, updatedAt: true, createdById: true },
      orderBy: { updatedAt: 'desc' },
    });
    const publicDocs = publicWs
      ? await prisma.document.findMany({
          where: { workspaceId: publicWs.id, isArchived: false, deletedAt: null },
          select: {
            id: true,
            title: true,
            parentId: true,
            workspaceId: true,
            contentJson: true,
            updatedAt: true,
            createdById: true,
            createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
          orderBy: { updatedAt: 'desc' },
        })
      : [];
    const sharedDocs = await prisma.document.findMany({
      where: {
        isArchived: false,
        deletedAt: null,
        permissions: { some: { userId: req.user!.id } },
        workspace: { ownerId: { not: req.user!.id }, kind: 'PRIVATE' },
      },
      select: {
        id: true,
        title: true,
        parentId: true,
        workspaceId: true,
        contentJson: true,
        updatedAt: true,
        createdById: true,
        workspace: { select: { id: true, name: true, ownerId: true } },
        createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const annotateFav = <T extends { id: string; parentId?: string | null; contentJson?: string | null }>(arr: T[]) => {
      // Older folders were stored as empty documents. A live child is authoritative
      // evidence that their parent is a folder, even without the newer marker.
      const parentIds = new Set(arr.map((d) => d.parentId).filter((id): id is string => Boolean(id)));
      return arr.map((d) => ({
        ...withFolderFlag(d),
        isFolder: isFolderContent(d.contentJson) || parentIds.has(d.id),
        isFavorite: favoriteIds.has(d.id),
      }));
    };
    const mine = annotateFav(mineDocs);
    const publicDocsWithFav = annotateFav(publicDocs);
    const shared = annotateFav(sharedDocs);
    const documentCount = (list: Array<{ isFolder?: boolean }>) =>
      list.filter((item) => !item.isFolder).length;

    res.json({
      workspaces: ownWorkspaces,
      publicWorkspace: publicWs,
      mine,
      public: publicDocsWithFav,
      shared,
      favorites,
      counts: {
        mine: documentCount(mine),
        public: documentCount(publicDocsWithFav),
        shared: documentCount(shared),
        favorites: documentCount(favorites),
      },
    });
  }),
);

docRouter.post(
  '/:id/favorite',
  asyncHandler(async (req, res) => {
    const { doc } = await loadDocWithAccess(req.user!, req.params.id);
    await prisma.documentFavorite.upsert({
      where: { userId_documentId: { userId: req.user!.id, documentId: doc.id } },
      update: {},
      create: { userId: req.user!.id, documentId: doc.id },
    });
    res.json({ ok: true });
  }),
);

docRouter.delete(
  '/:id/favorite',
  asyncHandler(async (req, res) => {
    await prisma.documentFavorite
      .delete({
        where: { userId_documentId: { userId: req.user!.id, documentId: req.params.id } },
      })
      .catch(() => undefined);
    res.json({ ok: true });
  }),
);

docRouter.post(
  '/',
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
    res.json({ doc: { ...doc, isFolder: body.isFolder === true } });
  }),
);

docRouter.post(
  '/import',
  uploadDocImport.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, '没有收到文件', 'NO_FILE');
    const workspaceId = (req.body?.workspaceId as string | undefined)?.trim();
    const workspaceKind = (req.body?.workspaceKind as string | undefined) as
      | 'PRIVATE'
      | 'PUBLIC'
      | undefined;
    let ws;
    if (workspaceId) {
      ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
      if (!ws) throw new HttpError(404, '工作区不存在', 'NOT_FOUND');
      if (ws.kind === 'PRIVATE' && ws.ownerId !== req.user!.id) {
        throw new HttpError(403, '无权限', 'FORBIDDEN');
      }
    } else {
      ws = await findTargetWorkspace(req.user!.id, workspaceKind ?? 'PRIVATE');
    }
    const originalName = normalizeFilename(req.file.originalname);
    const title =
      originalName.replace(/\.(docx|md|markdown|txt)$/i, '').slice(0, 120) || '未命名文档';
    const doc = await prisma.document.create({
      data: {
        workspaceId: ws.id,
        title,
        contentJson: '',
        createdById: req.user!.id,
      },
    });
    const createdAttachmentIds: string[] = [];
    const createdStoredNames: string[] = [];
    let html = '';
    try {
      html = await importByExtension(req.file.path, originalName, {
        persistImage: async (image) => {
          const stored = await storeUploadBuffer(image.buffer, {
            subdir: 'attachments',
            originalName: image.originalName,
          });
          createdStoredNames.push(stored.storedName);
          const att = await prisma.attachment.create({
            data: {
              ownerId: req.user!.id,
              documentId: doc.id,
              category: 'doc-image',
              originalName: image.originalName,
              storedName: stored.storedName,
              mimeType: image.mimeType,
              size: image.buffer.length,
            },
          });
          createdAttachmentIds.push(att.id);
          return `/api/attachments/${att.id}/raw`;
        },
      });
    } catch (err) {
      await prisma.attachment.deleteMany({ where: { id: { in: createdAttachmentIds } } }).catch(() => undefined);
      await prisma.document.delete({ where: { id: doc.id } }).catch(() => undefined);
      for (const storedName of createdStoredNames) {
        try {
          const abs = resolveUploadPath(storedName);
          if (abs && fs.existsSync(abs)) fs.unlinkSync(abs);
        } catch {
          /* ignore */
        }
      }
      throw new HttpError(400, (err as Error).message || '解析失败', 'IMPORT_FAILED');
    } finally {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
    }
    const updated = await prisma.document.update({
      where: { id: doc.id },
      data: { contentJson: html },
    });
    res.json({ doc: withFolderFlag(updated) });
  }),
);

docRouter.post(
  '/:id/copy-to-public',
  asyncHandler(async (req, res) => {
    const source = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: { workspace: true },
    });
    if (!source || source.isArchived) throw new HttpError(404, '文档不存在', 'NOT_FOUND');
    if (source.workspace.kind !== 'PRIVATE' || source.workspace.ownerId !== req.user!.id) {
      throw new HttpError(403, '只能复制自己的私人知识库文档', 'FORBIDDEN');
    }
    const sourceHasChildren = await prisma.document.count({
      where: { parentId: source.id, isArchived: false, deletedAt: null },
    });
    if (isFolderContent(source.contentJson) || sourceHasChildren > 0) {
      throw new HttpError(400, '文件夹请使用移动到公共知识库', 'FOLDER_COPY_NOT_SUPPORTED');
    }
    const publicWs = await findTargetWorkspace(req.user!.id, 'PUBLIC');

    const copiedIds = new Map<string, string>();
    const copyOne = async (doc: typeof source, targetParentId: string | null): Promise<typeof source> => {
      const copied = await prisma.document.create({
        data: {
          workspaceId: publicWs.id,
          parentId: targetParentId,
          title: doc.title,
          contentJson: doc.contentJson,
          createdById: req.user!.id,
        },
        include: { workspace: true },
      });
      copiedIds.set(doc.id, copied.id);
      const attachmentMap = await copyDocumentAttachments(doc.id, copied.id, req.user!.id);
      const contentJson = rewriteAttachmentLinks(doc.contentJson, attachmentMap);
      const updated =
        contentJson === copied.contentJson
          ? copied
          : await prisma.document.update({
              where: { id: copied.id },
              data: { contentJson },
              include: { workspace: true },
            });

      const children = await prisma.document.findMany({
        where: { parentId: doc.id, workspaceId: doc.workspaceId, isArchived: false, deletedAt: null },
        include: { workspace: true },
        orderBy: { updatedAt: 'desc' },
      });
      for (const child of children) {
        await copyOne(child, copied.id);
      }
      return updated;
    };

    const copied = await copyOne(source, null);
    res.json({ doc: withFolderFlag(copied), copiedCount: copiedIds.size });
  }),
);

// 移动（非复制）私人文档/文件夹到公共知识库。整棵子树一并迁移，私人侧移除，公共侧出现。
docRouter.post(
  '/:id/move-to-public',
  asyncHandler(async (req, res) => {
    const source = await prisma.document.findUnique({
      where: { id: req.params.id, deletedAt: null },
      include: { workspace: true },
    });
    if (!source) throw new HttpError(404, '文档不存在', 'NOT_FOUND');
    // 仅允许私人工作区 owner 移动自己的文档（与 copy-to-public 权限一致）
    if (source.workspace.kind !== 'PRIVATE' || source.workspace.ownerId !== req.user!.id) {
      throw new HttpError(403, '只能移动自己的私人知识库文档', 'FORBIDDEN');
    }
    const publicWs = await findTargetWorkspace(req.user!.id, 'PUBLIC');

    // 递归收集整棵子树的所有 doc id（含自身）
    const allIds: string[] = [];
    const stack = [source.id];
    const visited = new Set<string>();
    while (stack.length) {
      const cur = stack.pop()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      allIds.push(cur);
      const children = await prisma.document.findMany({
        where: { parentId: cur, deletedAt: null },
        select: { id: true },
      });
      children.forEach((c) => stack.push(c.id));
    }

    // 批量迁移：改 workspaceId 到公共；清理私人协作者权限（公共走 workspace 级权限）
    await prisma.$transaction([
      prisma.document.updateMany({
        where: { id: { in: allIds } },
        data: { workspaceId: publicWs.id, createdById: req.user!.id },
      }),
      prisma.documentPermission.deleteMany({
        where: { documentId: { in: allIds } },
      }),
    ]);
    if (allIds.length > 1 && !isFolderContent(source.contentJson)) {
      await prisma.document.update({
        where: { id: source.id },
        data: { contentJson: FOLDER_CONTENT },
      });
    }
    // 顶层文档 parentId 置 null（移到公共根目录）；子树内部结构不变
    const moved = await prisma.document.update({
      where: { id: source.id },
      data: { parentId: null },
      include: { workspace: true },
    });

    res.json({ doc: withFolderFlag(moved), movedCount: allIds.length });
  }),
);

// 管理员可将公共文档或整棵文件夹迁入自己的私人知识库。
docRouter.post(
  '/:id/move-to-private',
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'ADMIN') {
      throw new HttpError(403, '仅管理员可将公共内容转为私密', 'FORBIDDEN');
    }
    const source = await prisma.document.findUnique({
      where: { id: req.params.id, deletedAt: null },
      include: { workspace: true },
    });
    if (!source) throw new HttpError(404, '文档不存在', 'NOT_FOUND');
    if (source.workspace.kind !== 'PUBLIC') {
      throw new HttpError(400, '只能将公共知识库内容转为私密', 'NOT_PUBLIC');
    }
    const privateWs = await findTargetWorkspace(req.user!.id, 'PRIVATE');

    const allIds: string[] = [];
    const stack = [source.id];
    const visited = new Set<string>();
    while (stack.length) {
      const currentId = stack.pop()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      allIds.push(currentId);
      const children = await prisma.document.findMany({
        where: { parentId: currentId, workspaceId: source.workspaceId, deletedAt: null },
        select: { id: true },
      });
      children.forEach((child) => stack.push(child.id));
    }

    await prisma.$transaction([
      prisma.document.updateMany({
        where: { id: { in: allIds } },
        data: { workspaceId: privateWs.id, createdById: req.user!.id },
      }),
      prisma.documentPermission.deleteMany({ where: { documentId: { in: allIds } } }),
      prisma.document.update({ where: { id: source.id }, data: { parentId: null } }),
    ]);
    const moved = await prisma.document.findUniqueOrThrow({
      where: { id: source.id },
      include: { workspace: true },
    });
    res.json({ doc: withFolderFlag(moved), movedCount: allIds.length });
  }),
);

docRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { doc, access } = await loadDocWithAccess(req.user!, req.params.id);
    const hasChildren = await prisma.document.count({
      where: { parentId: doc.id, isArchived: false, deletedAt: null },
    });
    res.json({
      doc: { ...withFolderFlag(doc), isFolder: isFolderContent(doc.contentJson) || hasChildren > 0 },
      role: access.role,
      access,
    });
  }),
);

docRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { doc, access } = await loadDocWithAccess(req.user!, req.params.id);
    if (!access.canWrite) throw new HttpError(403, '只读权限', 'READONLY');
    const body = z
      .object({
        title: z.string().trim().min(1).max(120).optional(),
        contentJson: z.string().max(2_000_000).optional(),
        parentId: z.string().nullable().optional(),
        isArchived: z.boolean().optional(),
        // 乐观锁：客户端加载文档时记录的 updatedAt。不匹配表示文档已被他人修改。
        expectedUpdatedAt: z.string().datetime().optional(),
        // 用户在冲突面板确认后强制覆盖，跳过乐观锁检查。
        force: z.boolean().optional(),
      })
      .parse(req.body);
    const { expectedUpdatedAt, force, ...writeFields } = body;
    if (body.parentId !== undefined && body.parentId !== null) {
      if (body.parentId === doc.id) {
        throw new HttpError(400, '不能将文档移动到自身', 'INVALID_PARENT');
      }
      const parent = await prisma.document.findUnique({
        where: { id: body.parentId },
        select: { id: true, workspaceId: true },
      });
      if (!parent) throw new HttpError(404, '父文档不存在', 'PARENT_NOT_FOUND');
      if (parent.workspaceId !== doc.workspaceId) {
        throw new HttpError(400, '不能跨工作区移动', 'CROSS_WORKSPACE');
      }
      // 循环检测：父链中不能出现自身
      let cursor: { id: string; parentId: string | null } | null = await prisma.document.findUnique(
        {
          where: { id: body.parentId },
          select: { id: true, parentId: true },
        },
      );
      const visited = new Set<string>();
      while (cursor) {
        if (cursor.id === doc.id) {
          throw new HttpError(400, '不能移动到自身的子孙下', 'CYCLIC_PARENT');
        }
        if (visited.has(cursor.id)) break;
        visited.add(cursor.id);
        if (!cursor.parentId) break;
        cursor = await prisma.document.findUnique({
          where: { id: cursor.parentId },
          select: { id: true, parentId: true },
        });
      }
    }
    // 乐观锁：force=true 跳过版本检查（用户已在冲突面板确认覆盖）；
    // 否则把 expectedUpdatedAt 加入 where，不匹配时 Prisma 抛 P2025（记录未找到）= 文档已被他人修改。
    const versionGuard = !force && expectedUpdatedAt ? { updatedAt: new Date(expectedUpdatedAt) } : {};
    let updated;
    try {
      updated = await prisma.document.update({ where: { id: doc.id, ...versionGuard }, data: writeFields });
    } catch (e: unknown) {
      if (force || !expectedUpdatedAt) throw e;
      const code = (e as { code?: string }).code;
      if (code !== 'P2025') throw e;
      // 冲突：返回服务端最新文档，供前端做差异对比
      const latest = await prisma.document.findUniqueOrThrow({
        where: { id: doc.id },
        include: { workspace: true },
      });
      throw new HttpError(409, '文档已被他人修改，请先查看最新版本', 'DOC_CONFLICT', { doc: latest });
    }
    res.json({ doc: withFolderFlag(updated) });
  }),
);

docRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { doc, access } = await loadDocWithAccess(req.user!, req.params.id);
    if (!access.canDelete) throw new HttpError(403, '没有删除权限', 'FORBIDDEN');
    // 公共知识库文档做软删除（进回收站，admin 可恢复）；私人文档仍硬删除。
    if (doc.workspace.kind === 'PUBLIC') {
      const now = new Date();
      // 递归软删除整棵子树（含子文件夹/子文档），避免 parentId 指向已删父节点导致树断裂
      const stack: string[] = [doc.id];
      const visited = new Set<string>();
      while (stack.length) {
        const currentId = stack.pop()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);
        const children = await prisma.document.findMany({
          where: { parentId: currentId, deletedAt: null },
          select: { id: true },
        });
        children.forEach((c) => stack.push(c.id));
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

docRouter.get(
  '/:id/export',
  asyncHandler(async (req, res) => {
    const { doc } = await loadDocWithAccess(req.user!, req.params.id);
    const format = (req.query.format as string) || 'md';
    const safeTitle = doc.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || '文档';
    const html = doc.contentJson || '<p></p>';
    if (format === 'md') {
      const md = htmlToMarkdown(html);
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', contentDispositionAttachment(`${safeTitle}.md`));
      res.send(md);
      return;
    }
    if (format === 'html') {
      const full = htmlToFullPage(html, doc.title);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', contentDispositionAttachment(`${safeTitle}.html`));
      res.send(full);
      return;
    }
    if (format === 'docx') {
      const origin = `${req.protocol}://${req.get('host')}`;
      try {
        const buf = await htmlToDocx(html, doc.title, origin);
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        );
        res.setHeader('Content-Disposition', contentDispositionAttachment(`${safeTitle}.docx`));
        res.send(buf);
      } catch {
        // html-to-docx 库对部分 HTML 结构会崩溃且无法穷举处理。
        // 兜底降级：导出 Word 兼容的 HTML（.doc 扩展名，Word/WPS 均可直接打开编辑），
        // 保证用户永远能拿到文件而不是 500 报错。
        const fallback = htmlToFullPage(html, doc.title);
        res.setHeader('Content-Type', 'application/msword');
        res.setHeader('Content-Disposition', contentDispositionAttachment(`${safeTitle}.doc`));
        res.send(fallback);
      }
      return;
    }
    throw new HttpError(400, '不支持的导出格式', 'INVALID_FORMAT');
  }),
);

docRouter.get(
  '/:id/versions',
  asyncHandler(async (req, res) => {
    const { doc } = await loadDocWithAccess(req.user!, req.params.id);
    const list = await prisma.documentVersion.findMany({
      where: { documentId: doc.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });
    res.json({ list });
  }),
);

docRouter.post(
  '/:id/versions',
  asyncHandler(async (req, res) => {
    const { doc, access } = await loadDocWithAccess(req.user!, req.params.id);
    if (!access.canWrite) throw new HttpError(403, '只读权限', 'READONLY');
    const body = z.object({ label: z.string().trim().max(40).optional() }).parse(req.body ?? {});
    const v = await prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        title: doc.title,
        contentJson: doc.contentJson,
        label: body.label?.length ? body.label : null,
        authorId: req.user!.id,
      },
    });
    res.json({ version: v });
  }),
);

docRouter.post(
  '/:id/versions/:vid/restore',
  asyncHandler(async (req, res) => {
    const { doc, access } = await loadDocWithAccess(req.user!, req.params.id);
    if (!access.canWrite) throw new HttpError(403, '只读权限', 'READONLY');
    const version = await prisma.documentVersion.findUnique({ where: { id: req.params.vid } });
    if (!version || version.documentId !== doc.id) {
      throw new HttpError(404, '版本不存在', 'NOT_FOUND');
    }
    await prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        title: doc.title,
        contentJson: doc.contentJson,
        label: '恢复前自动快照',
        authorId: req.user!.id,
      },
    });
    const updated = await prisma.document.update({
      where: { id: doc.id },
      data: { title: version.title, contentJson: version.contentJson },
    });
    res.json({ doc: withFolderFlag(updated) });
  }),
);

const commentAuthorSelect = { id: true, name: true, email: true, avatarUrl: true } as const;

docRouter.get(
  '/:id/comments',
  asyncHandler(async (req, res) => {
    const { doc } = await loadDocWithAccess(req.user!, req.params.id);
    const list = await prisma.documentComment.findMany({
      where: { documentId: doc.id },
      orderBy: [{ resolvedAt: 'asc' }, { createdAt: 'asc' }],
      include: { author: { select: commentAuthorSelect } },
      take: 500,
    });
    res.json({ list });
  }),
);

docRouter.post(
  '/:id/comments',
  asyncHandler(async (req, res) => {
    const { doc } = await loadDocWithAccess(req.user!, req.params.id);
    const body = z
      .object({
        body: z.string().trim().min(1).max(4000),
        anchorId: z.string().trim().max(120).nullable().optional(),
        anchorText: z.string().trim().max(300).nullable().optional(),
        parentId: z.string().nullable().optional(),
      })
      .parse(req.body);
    if (body.parentId) {
      const parent = await prisma.documentComment.findUnique({ where: { id: body.parentId } });
      if (!parent || parent.documentId !== doc.id) {
        throw new HttpError(404, '父评论不存在', 'COMMENT_PARENT_NOT_FOUND');
      }
    }
    const comment = await prisma.documentComment.create({
      data: {
        documentId: doc.id,
        authorId: req.user!.id,
        body: body.body,
        anchorId: body.anchorId || null,
        anchorText: body.anchorText || null,
        parentId: body.parentId ?? null,
      },
      include: { author: { select: commentAuthorSelect } },
    });
    res.json({ comment });
  }),
);

docRouter.patch(
  '/:id/comments/:commentId',
  asyncHandler(async (req, res) => {
    const { access } = await loadDocWithAccess(req.user!, req.params.id);
    const target = await prisma.documentComment.findUnique({ where: { id: req.params.commentId } });
    if (!target || target.documentId !== req.params.id) {
      throw new HttpError(404, '评论不存在', 'COMMENT_NOT_FOUND');
    }
    const body = z
      .object({
        body: z.string().trim().min(1).max(4000).optional(),
        resolved: z.boolean().optional(),
      })
      .parse(req.body);
    const canEditBody = target.authorId === req.user!.id || access.canWrite;
    if (body.body !== undefined && !canEditBody) {
      throw new HttpError(403, '只能编辑自己的评论', 'FORBIDDEN');
    }
    if (body.resolved !== undefined && !access.canWrite && target.authorId !== req.user!.id) {
      throw new HttpError(403, '没有处理评论的权限', 'FORBIDDEN');
    }
    const comment = await prisma.documentComment.update({
      where: { id: target.id },
      data: {
        body: body.body,
        resolvedAt: body.resolved === undefined ? undefined : body.resolved ? new Date() : null,
      },
      include: { author: { select: commentAuthorSelect } },
    });
    res.json({ comment });
  }),
);

docRouter.delete(
  '/:id/comments/:commentId',
  asyncHandler(async (req, res) => {
    const { access } = await loadDocWithAccess(req.user!, req.params.id);
    const target = await prisma.documentComment.findUnique({ where: { id: req.params.commentId } });
    if (!target || target.documentId !== req.params.id) {
      throw new HttpError(404, '评论不存在', 'COMMENT_NOT_FOUND');
    }
    if (target.authorId !== req.user!.id && !access.canWrite) {
      throw new HttpError(403, '没有删除评论的权限', 'FORBIDDEN');
    }
    await prisma.documentComment.delete({ where: { id: target.id } });
    res.json({ ok: true });
  }),
);

docRouter.get(
  '/:id/collaborators',
  asyncHandler(async (req, res) => {
    const { doc } = await loadDocWithAccess(req.user!, req.params.id);
    const perms = await prisma.documentPermission.findMany({
      where: { documentId: doc.id },
      include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const owner = await prisma.user.findUnique({
      where: { id: doc.createdById },
      select: { id: true, email: true, name: true, avatarUrl: true },
    });
    res.json({ owner, collaborators: perms });
  }),
);

docRouter.post(
  '/:id/collaborators',
  asyncHandler(async (req, res) => {
    const { doc, access } = await loadDocWithAccess(req.user!, req.params.id);
    if (!access.canInvite) throw new HttpError(403, '只有所有者可邀请协作者', 'FORBIDDEN');
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
    if (user.id === doc.createdById) {
      throw new HttpError(400, '不能添加文档创建者本人', 'INVALID');
    }
    const perm = await prisma.documentPermission.upsert({
      where: { documentId_userId: { documentId: doc.id, userId: user.id } },
      update: { role: body.role },
      create: { documentId: doc.id, userId: user.id, role: body.role },
      include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } },
    });
    res.json({ collaborator: perm });
  }),
);

docRouter.patch(
  '/:id/collaborators/:userId',
  asyncHandler(async (req, res) => {
    const { doc, access } = await loadDocWithAccess(req.user!, req.params.id);
    if (!access.canInvite) throw new HttpError(403, '只有所有者可调整协作者权限', 'FORBIDDEN');
    const body = z.object({ role: z.enum(['VIEWER', 'EDITOR']) }).parse(req.body);
    const perm = await prisma.documentPermission.update({
      where: { documentId_userId: { documentId: doc.id, userId: req.params.userId } },
      data: { role: body.role },
      include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } },
    });
    res.json({ collaborator: perm });
  }),
);

docRouter.delete(
  '/:id/collaborators/:userId',
  asyncHandler(async (req, res) => {
    const { doc, access } = await loadDocWithAccess(req.user!, req.params.id);
    if (!access.canInvite) throw new HttpError(403, '只有所有者可移除协作者', 'FORBIDDEN');
    await prisma.documentPermission.delete({
      where: { documentId_userId: { documentId: doc.id, userId: req.params.userId } },
    });
    res.json({ ok: true });
  }),
);

// 兼容旧的 /docs 列表 API：返回我的私有 + 共享文档
docRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = z
      .object({ q: z.string().trim().optional(), workspaceId: z.string().optional() })
      .parse(req.query);
    const myWs = await prisma.workspace.findMany({
      where: { ownerId: req.user!.id, kind: 'PRIVATE' },
      select: { id: true },
    });
    const wsIds = myWs.map((w) => w.id);
    const list = await prisma.document.findMany({
      where: {
        workspaceId: q.workspaceId ? q.workspaceId : { in: wsIds },
        isArchived: false,
        deletedAt: null,
        ...(q.q ? { title: { contains: q.q } } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: { id: true, title: true, updatedAt: true, workspaceId: true, parentId: true },
    });
    res.json({ list });
  }),
);

export { computeAccess };
