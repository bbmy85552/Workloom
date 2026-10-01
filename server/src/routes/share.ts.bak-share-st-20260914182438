import { Router } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireEmailVerified } from '../middleware/requireEmailVerified.js';

export const shareRouter = Router();

async function loadResource(resourceType: string, resourceId: string) {
  if (resourceType === 'doc') {
    const doc = await prisma.document.findUnique({
      where: { id: resourceId },
      include: { workspace: true, permissions: true },
    });
    if (!doc) throw new HttpError(404, '文档不存在', 'NOT_FOUND');
    return { kind: 'doc' as const, doc };
  }
  if (resourceType === 'table') {
    const tb = await prisma.tableBase.findUnique({
      where: { id: resourceId },
      include: { workspace: true, permissions: true },
    });
    if (!tb) throw new HttpError(404, '数据表不存在', 'NOT_FOUND');
    return { kind: 'table' as const, table: tb };
  }
  throw new HttpError(400, '资源类型不合法', 'BAD_TYPE');
}

function isOwnerOrEditor(
  userId: string,
  res:
    | { kind: 'doc'; doc: { workspace: { ownerId: string }; createdById: string; permissions: { userId: string; role: string }[] } }
    | { kind: 'table'; table: { workspace: { ownerId: string }; createdById: string; permissions: { userId: string; role: string }[] } },
) {
  if (res.kind === 'doc') {
    const d = res.doc;
    if (d.workspace.ownerId === userId || d.createdById === userId) return 'owner';
    const p = d.permissions.find((x) => x.userId === userId);
    if (p?.role === 'EDITOR') return 'editor';
    if (p?.role === 'VIEWER') return 'viewer';
    return null;
  }
  const t = res.table;
  if (t.workspace.ownerId === userId || t.createdById === userId) return 'owner';
  const p = t.permissions.find((x) => x.userId === userId);
  if (p?.role === 'EDITOR') return 'editor';
  if (p?.role === 'VIEWER') return 'viewer';
  return null;
}

shareRouter.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const link = await prisma.shareLink.findUnique({ where: { token: req.params.token } });
    if (!link || link.revokedAt) throw new HttpError(404, '分享链接无效或已被撤销', 'NOT_FOUND');
    if (link.expiresAt && link.expiresAt < new Date()) throw new HttpError(410, '分享链接已过期', 'EXPIRED');

    if (link.resourceType === 'doc') {
      const doc = await prisma.document.findUnique({
        where: { id: link.resourceId, deletedAt: null },
        select: {
          id: true,
          title: true,
          contentJson: true,
          updatedAt: true,
          createdBy: { select: { name: true, email: true, avatarUrl: true } },
        },
      });
      if (!doc) throw new HttpError(404, '文档不存在', 'NOT_FOUND');
      res.json({ resourceType: 'doc', role: link.role, requireLogin: link.requireLogin, doc });
      return;
    }
    if (link.resourceType === 'table') {
      const tb = await prisma.tableBase.findUnique({
        where: { id: link.resourceId },
        select: { id: true, name: true, updatedAt: true, createdById: true },
      });
      if (!tb) throw new HttpError(404, '数据表不存在', 'NOT_FOUND');
      const fields = await prisma.tableField.findMany({
        where: { tableId: tb.id },
        orderBy: { order: 'asc' },
      });
      const records = await prisma.tableRecord.findMany({
        where: { tableId: tb.id },
        orderBy: { order: 'asc' },
      });
      res.json({
        resourceType: 'table',
        role: link.role,
        requireLogin: link.requireLogin,
        table: tb,
        fields: fields.map((f) => ({ ...f, options: JSON.parse(f.options || '{}') })),
        records: records.map((r) => ({ ...r, data: JSON.parse(r.dataJson || '{}') })),
      });
      return;
    }
    throw new HttpError(400, '资源类型不支持', 'BAD_TYPE');
  }),
);

shareRouter.use(requireAuth, requireEmailVerified);

shareRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        resourceType: z.enum(['doc', 'table']),
        resourceId: z.string(),
        role: z.enum(['view', 'edit']).default('view'),
        requireLogin: z.boolean().default(false),
        expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
      })
      .parse(req.body);
    const resource = await loadResource(body.resourceType, body.resourceId);
    const ownership = isOwnerOrEditor(req.user!.id, resource);
    if (ownership !== 'owner') throw new HttpError(403, '只有所有者可以创建分享链接', 'FORBIDDEN');
    const expiresAt = body.expiresInDays
      ? new Date(Date.now() + body.expiresInDays * 86400_000)
      : null;
    const link = await prisma.shareLink.create({
      data: {
        token: nanoid(20),
        resourceType: body.resourceType,
        resourceId: body.resourceId,
        role: body.role,
        requireLogin: body.requireLogin,
        expiresAt,
        createdById: req.user!.id,
      },
    });
    res.json({ link });
  }),
);

shareRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        resourceType: z.enum(['doc', 'table']),
        resourceId: z.string(),
      })
      .parse(req.query);
    const resource = await loadResource(q.resourceType, q.resourceId);
    const ownership = isOwnerOrEditor(req.user!.id, resource);
    if (!ownership) throw new HttpError(403, '无权查看', 'FORBIDDEN');
    const list = await prisma.shareLink.findMany({
      where: {
        resourceType: q.resourceType,
        resourceId: q.resourceId,
        revokedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ list });
  }),
);

shareRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const link = await prisma.shareLink.findUnique({ where: { id: req.params.id } });
    if (!link) throw new HttpError(404, '分享不存在', 'NOT_FOUND');
    if (link.createdById !== req.user!.id) {
      throw new HttpError(403, '无权操作该分享', 'FORBIDDEN');
    }
    await prisma.shareLink.update({
      where: { id: link.id },
      data: { revokedAt: new Date() },
    });
    res.json({ ok: true });
  }),
);

shareRouter.post(
  '/:token/claim',
  asyncHandler(async (req, res) => {
    const link = await prisma.shareLink.findUnique({ where: { token: req.params.token } });
    if (!link || link.revokedAt) throw new HttpError(404, '分享链接无效或已被撤销', 'NOT_FOUND');
    if (link.expiresAt && link.expiresAt < new Date()) throw new HttpError(410, '分享链接已过期', 'EXPIRED');
    const role = link.role === 'edit' ? 'EDITOR' : 'VIEWER';
    if (link.resourceType === 'doc') {
      const doc = await prisma.document.findUnique({ where: { id: link.resourceId } });
      if (!doc) throw new HttpError(404, '文档不存在', 'NOT_FOUND');
      await prisma.documentPermission.upsert({
        where: { documentId_userId: { documentId: doc.id, userId: req.user!.id } },
        update: { role },
        create: { documentId: doc.id, userId: req.user!.id, role },
      });
      res.json({ ok: true, redirect: `/app/docs/${doc.id}` });
      return;
    }
    if (link.resourceType === 'table') {
      const tb = await prisma.tableBase.findUnique({ where: { id: link.resourceId } });
      if (!tb) throw new HttpError(404, '数据表不存在', 'NOT_FOUND');
      await prisma.tablePermission.upsert({
        where: { tableId_userId: { tableId: tb.id, userId: req.user!.id } },
        update: { role },
        create: { tableId: tb.id, userId: req.user!.id, role },
      });
      res.json({ ok: true, redirect: `/app/tables/${tb.id}` });
      return;
    }
    throw new HttpError(400, '资源类型不支持', 'BAD_TYPE');
  }),
);
