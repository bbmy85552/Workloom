import { Router } from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../lib/asyncHandler.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { requireEmailVerified } from '../middleware/requireEmailVerified.js';
import {
  normalizeFilename,
  resolveExistingUploadPath,
  resolveUploadPath,
  storedRelative,
  uploadAny,
  uploadImage,
} from '../lib/upload.js';
import { contentDispositionAttachment } from '../lib/filename.js';

export const attachmentRouter = Router();

async function assertCanWriteResource(
  user: { id: string; role: string },
  documentId: string | null,
  tableId: string | null,
) {
  const userId = user.id;
  if (documentId) {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: { workspace: true, permissions: true },
    });
    if (!doc) throw new HttpError(404, '关联文档不存在', 'DOC_NOT_FOUND');
    const { computeAccess } = await import('../lib/docAccess.js');
    const access = computeAccess(user, doc, { publicDefaultWrite: true });
    if (!access.canWrite) throw new HttpError(403, '没有写权限', 'FORBIDDEN');
  }
  if (tableId) {
    const tb = await prisma.tableBase.findUnique({
      where: { id: tableId },
      include: { workspace: true, permissions: true },
    });
    if (!tb) throw new HttpError(404, '关联数据表不存在', 'TABLE_NOT_FOUND');
    const isOwner = tb.workspace.ownerId === userId || tb.createdById === userId;
    const perm = tb.permissions.find((p) => p.userId === userId);
    if (!isOwner && (!perm || perm.role === 'VIEWER')) {
      throw new HttpError(403, '没有写权限', 'FORBIDDEN');
    }
  }
}

async function canReadAttachment(userId: string | undefined, attachment: {
  id: string;
  ownerId: string;
  documentId: string | null;
  tableId: string | null;
  category: string;
}, shareToken?: string) {
  if (attachment.category === 'avatar') return true;
  if (userId && attachment.ownerId === userId) return true;
  if (userId && attachment.documentId) {
    const doc = await prisma.document.findUnique({
      where: { id: attachment.documentId },
      include: { workspace: true, permissions: true },
    });
    if (doc && doc.workspace.kind === 'PUBLIC') return true;
    if (doc && (doc.workspace.ownerId === userId || doc.createdById === userId)) return true;
    if (doc && doc.permissions.some((p) => p.userId === userId)) return true;
  }
  if (userId && attachment.tableId) {
    const tb = await prisma.tableBase.findUnique({
      where: { id: attachment.tableId },
      include: { workspace: true, permissions: true },
    });
    if (tb && (tb.workspace.ownerId === userId || tb.createdById === userId)) return true;
    if (tb && tb.permissions.some((p) => p.userId === userId)) return true;
  }
  if (shareToken && (attachment.documentId || attachment.tableId)) {
    const link = await prisma.shareLink.findUnique({ where: { token: shareToken } });
    if (
      link &&
      !link.revokedAt &&
      (!link.expiresAt || link.expiresAt > new Date()) &&
      ((attachment.documentId && link.resourceType === 'doc' && link.resourceId === attachment.documentId) ||
        (attachment.tableId && link.resourceType === 'table' && link.resourceId === attachment.tableId))
    ) {
      return true;
    }
  }
  return false;
}

attachmentRouter.get(
  '/:id/raw',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const att = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!att) throw new HttpError(404, '文件不存在', 'NOT_FOUND');
    const userId = req.user?.id;
    const shareToken = (req.query.st as string | undefined) || undefined;
    const ok = await canReadAttachment(userId, att, shareToken);
    if (!ok) throw new HttpError(403, '无权访问', 'FORBIDDEN');
    const abs = resolveExistingUploadPath(att.storedName);
    if (!abs || !fs.existsSync(abs)) {
      throw new HttpError(404, '文件已丢失', 'FILE_MISSING');
    }
    res.setHeader('Content-Type', att.mimeType);
    res.setHeader('Cache-Control', att.category === 'avatar' ? 'public, max-age=86400' : 'private, max-age=3600');
    if (req.query.download === '1') {
      res.setHeader('Content-Disposition', contentDispositionAttachment(att.originalName));
    }
    fs.createReadStream(abs).pipe(res);
  }),
);

attachmentRouter.use(requireAuth, requireEmailVerified);

const metaSchema = z.object({
  documentId: z.string().optional(),
  tableId: z.string().optional(),
  category: z.enum(['file', 'image', 'doc-image', 'doc-file', 'table-file']).optional(),
});

function pickMeta(req: any) {
  return metaSchema.parse({
    documentId: req.body?.documentId || undefined,
    tableId: req.body?.tableId || undefined,
    category: req.body?.category || undefined,
  });
}

function serializeAttachment(a: {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: string;
  createdAt: Date;
}) {
  return {
    id: a.id,
    originalName: normalizeFilename(a.originalName),
    mimeType: a.mimeType,
    size: a.size,
    category: a.category,
    createdAt: a.createdAt,
    url: `/api/attachments/${a.id}/raw`,
  };
}

attachmentRouter.post(
  '/upload',
  uploadAny.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, '没有收到文件', 'NO_FILE');
    const meta = pickMeta(req);
    await assertCanWriteResource(req.user!, meta.documentId ?? null, meta.tableId ?? null);
    const stored = storedRelative(req.file.path);
    const att = await prisma.attachment.create({
      data: {
        ownerId: req.user!.id,
        documentId: meta.documentId ?? null,
        tableId: meta.tableId ?? null,
        category: meta.category ?? 'file',
        originalName: normalizeFilename(req.file.originalname),
        storedName: stored,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
    });
    res.json({ attachment: serializeAttachment(att) });
  }),
);

attachmentRouter.post(
  '/upload-image',
  uploadImage.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, '没有收到图片', 'NO_FILE');
    const meta = pickMeta(req);
    if (meta.documentId || meta.tableId) {
      await assertCanWriteResource(req.user!, meta.documentId ?? null, meta.tableId ?? null);
    }
    const stored = storedRelative(req.file.path);
    const att = await prisma.attachment.create({
      data: {
        ownerId: req.user!.id,
        documentId: meta.documentId ?? null,
        tableId: meta.tableId ?? null,
        category: meta.category ?? 'image',
        originalName: normalizeFilename(req.file.originalname),
        storedName: stored,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
    });
    res.json({ attachment: serializeAttachment(att) });
  }),
);

attachmentRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        documentId: z.string().optional(),
        tableId: z.string().optional(),
      })
      .parse(req.query);
    const list = await prisma.attachment.findMany({
      where: {
        ownerId: req.user!.id,
        documentId: q.documentId || undefined,
        tableId: q.tableId || undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ list: list.map(serializeAttachment) });
  }),
);

attachmentRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const att = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!att) throw new HttpError(404, '文件不存在', 'NOT_FOUND');
    if (att.ownerId !== req.user!.id) throw new HttpError(403, '无权限', 'FORBIDDEN');
    await prisma.attachment.delete({ where: { id: att.id } });
    try {
      const abs = resolveUploadPath(att.storedName);
      if (abs && fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch {
      /* ignore */
    }
    res.json({ ok: true });
  }),
);
