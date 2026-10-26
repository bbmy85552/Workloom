import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../lib/asyncHandler.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { requireEmailVerified } from '../middleware/requireEmailVerified.js';
import { uploadHtmlPreview } from '../lib/upload.js';
import {
  assertWorkspaceWritable,
  canReadHtml,
  canWriteHtml,
  extractUpload,
  listPreviewFiles,
  loadHtmlPreview,
  mimeFor,
  previewDir,
  removePreviewDir,
  sanitizeRel,
} from '../lib/htmlPreview.js';

export const htmlPreviewRouter = Router();

// ---- 静态文件服务：登录用户（工作区权限）或有效分享 token 均可读 ----
// 注意：必须注册在 requireAuth 之前，否则分享裸页打不开。
htmlPreviewRouter.get(
  '/:id/files/*',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const relRaw = (req.params as Record<string, string>)[0] || '';
    const preview = await loadHtmlPreview(id);
    let allowed = false;
    const user = (req as unknown as { user?: { id: string; role: string } }).user;
    if (user && canReadHtml(user, preview)) allowed = true;
    if (!allowed && typeof req.query.token === 'string' && req.query.token) {
      const link = await prisma.shareLink.findUnique({ where: { token: req.query.token } });
      if (
        link &&
        !link.revokedAt &&
        link.resourceType === 'html' &&
        link.resourceId === id &&
        (!link.expiresAt || link.expiresAt >= new Date())
      ) {
        allowed = true;
      }
    }
    if (!allowed) throw new HttpError(403, '无权限', 'FORBIDDEN');
    const rel = sanitizeRel(relRaw);
    if (!rel) throw new HttpError(400, '路径不合法', 'BAD_PATH');
    const dir = previewDir(id);
    const abs = path.join(dir, rel);
    if (!abs.startsWith(dir + path.sep)) throw new HttpError(400, '路径不合法', 'BAD_PATH');
    let st: fs.Stats;
    try {
      st = await fs.promises.stat(abs);
    } catch {
      throw new HttpError(404, '文件不存在', 'NOT_FOUND');
    }
    if (!st.isFile()) throw new HttpError(404, '文件不存在', 'NOT_FOUND');
    res.setHeader('Content-Type', mimeFor(rel));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(abs).pipe(res);
  }),
);

htmlPreviewRouter.use(requireAuth, requireEmailVerified);

function baseNameNoExt(name: string): string {
  const base = path.basename(name);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

htmlPreviewRouter.post(
  '/',
  uploadHtmlPreview.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, '没有收到文件', 'NO_FILE');
    const body = z
      .object({
        workspaceId: z.string().min(1).optional(),
        workspaceKind: z.enum(['PUBLIC']).optional(),
        title: z.string().trim().max(100).optional(),
        entryPath: z.string().trim().max(500).optional(),
      })
      .parse(req.body);
    const ws = body.workspaceId
      ? await prisma.workspace.findUnique({ where: { id: body.workspaceId } })
      : body.workspaceKind === 'PUBLIC'
        ? await prisma.workspace.findFirst({ where: { kind: 'PUBLIC' } })
        : null;
    if (!ws) throw new HttpError(404, '工作区不存在', 'NOT_FOUND');
    assertWorkspaceWritable(req.user!, ws);
    const preview = await prisma.htmlPreview.create({
      data: {
        workspaceId: ws.id,
        createdById: req.user!.id,
        title: body.title || baseNameNoExt(req.file.originalname),
        entryPath: '',
      },
    });
    try {
      const result = await extractUpload(
        req.file.buffer,
        req.file.originalname,
        previewDir(preview.id),
        body.entryPath,
      );
      const updated = await prisma.htmlPreview.update({
        where: { id: preview.id },
        data: { entryPath: result.entryPath, fileCount: result.files.length, totalSize: result.totalSize },
      });
      res.json({ preview: updated });
    } catch (err) {
      await prisma.htmlPreview.delete({ where: { id: preview.id } }).catch(() => undefined);
      await removePreviewDir(preview.id);
      throw err;
    }
  }),
);

htmlPreviewRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const all = await prisma.htmlPreview.findMany({
      include: { workspace: true, createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const list = all
      .filter((p) => canReadHtml(req.user!, p))
      .map((p) => ({
        id: p.id,
        workspaceId: p.workspaceId,
        workspaceKind: p.workspace.kind,
        createdById: p.createdById,
        createdByName: p.createdBy.name,
        title: p.title,
        entryPath: p.entryPath,
        fileCount: p.fileCount,
        totalSize: p.totalSize,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }));
    res.json({ previews: list });
  }),
);

htmlPreviewRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const preview = await loadHtmlPreview(req.params.id);
    if (!canReadHtml(req.user!, preview)) throw new HttpError(403, '无权限', 'FORBIDDEN');
    const files = await listPreviewFiles(previewDir(preview.id));
    res.json({
      preview: {
        id: preview.id,
        workspaceId: preview.workspaceId,
        workspaceKind: preview.workspace.kind,
        createdById: preview.createdById,
        title: preview.title,
        entryPath: preview.entryPath,
        fileCount: preview.fileCount,
        totalSize: preview.totalSize,
        createdAt: preview.createdAt,
        updatedAt: preview.updatedAt,
        canWrite: canWriteHtml(req.user!, preview),
      },
      files,
    });
  }),
);

htmlPreviewRouter.post(
  '/:id/reupload',
  uploadHtmlPreview.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, '没有收到文件', 'NO_FILE');
    const preview = await loadHtmlPreview(req.params.id);
    if (!canWriteHtml(req.user!, preview)) throw new HttpError(403, '无权限', 'FORBIDDEN');
    const body = z
      .object({
        title: z.string().trim().max(100).optional(),
        entryPath: z.string().trim().max(500).optional(),
      })
      .parse(req.body);
    const dir = previewDir(preview.id);
    const backup = `${dir}.bak-${Date.now()}`;
    await fs.promises.rename(dir, backup).catch(() => undefined);
    try {
      const result = await extractUpload(req.file.buffer, req.file.originalname, dir, body.entryPath);
      const updated = await prisma.htmlPreview.update({
        where: { id: preview.id },
        data: {
          entryPath: result.entryPath,
          fileCount: result.files.length,
          totalSize: result.totalSize,
          ...(body.title ? { title: body.title } : {}),
        },
      });
      await fs.promises.rm(backup, { recursive: true, force: true });
      res.json({ preview: updated });
    } catch (err) {
      await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => undefined);
      await fs.promises.rename(backup, dir).catch(() => undefined);
      throw err;
    }
  }),
);

htmlPreviewRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const preview = await loadHtmlPreview(req.params.id);
    if (!canWriteHtml(req.user!, preview)) throw new HttpError(403, '无权限', 'FORBIDDEN');
    await prisma.htmlPreview.delete({ where: { id: preview.id } });
    await removePreviewDir(preview.id);
    res.json({ ok: true });
  }),
);
