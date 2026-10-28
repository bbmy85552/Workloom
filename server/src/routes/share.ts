import { Router } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireEmailVerified } from '../middleware/requireEmailVerified.js';
import { computeAccess } from '../lib/docAccess.js';
import { ensureDailyPick } from '../lib/dailyPicks.js';
import { env } from '../env.js';
import { verifyToken } from '../lib/jwt.js';
import { findActiveSessionByToken } from '../lib/session.js';
import type { Request } from 'express';

// 尝试从 Cookie/Bearer 解析当前登录用户（不抛错）；供公开分享接口按需识别观看者。
async function optionalUser(req: Request) {
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[env.COOKIE_NAME];
  const auth = req.headers.authorization;
  const token = cookieToken || (auth?.startsWith('Bearer ') ? auth.slice(7) : undefined);
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, status: true },
    });
    if (!user || user.status === 'DISABLED') return null;
    if (payload.sid) {
      const session = await findActiveSessionByToken(token);
      if (!session || session.userId !== user.id) return null;
    }
    return user;
  } catch {
    return null;
  }
}

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
  if (resourceType === 'html') {
    const preview = await prisma.htmlPreview.findUnique({
      where: { id: resourceId, deletedAt: null },
      include: { workspace: true },
    });
    if (!preview) throw new HttpError(404, 'HTML 预览不存在', 'NOT_FOUND');
    return { kind: 'html' as const, html: preview };
  }
  throw new HttpError(400, '资源类型不合法', 'BAD_TYPE');
}

function isOwnerOrEditor(
  userId: string,
  res:
    | { kind: 'doc'; doc: { workspace: { ownerId: string }; createdById: string; permissions: { userId: string; role: string }[] } }
    | { kind: 'table'; table: { workspace: { ownerId: string }; createdById: string; permissions: { userId: string; role: string }[] } }
    | { kind: 'html'; html: { workspace: { ownerId: string }; createdById: string } },
) {
  if (res.kind === 'doc') {
    const d = res.doc;
    if (d.workspace.ownerId === userId || d.createdById === userId) return 'owner';
    const p = d.permissions.find((x) => x.userId === userId);
    if (p?.role === 'EDITOR') return 'editor';
    if (p?.role === 'VIEWER') return 'viewer';
    return null;
  }
  if (res.kind === 'html') {
    const h = res.html;
    if (h.workspace.ownerId === userId || h.createdById === userId) return 'owner';
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
    if (link.trackViews) {
      const viewer = await optionalUser(req);
      if (!viewer) {
        res.json({
          resourceType: link.resourceType,
          role: link.role,
          requireLogin: true,
          trackViews: true,
          loginRequired: true,
        });
        return;
      }
    }

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
      res.json({ resourceType: 'doc', role: link.role, requireLogin: link.requireLogin, trackViews: link.trackViews, doc });
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
        trackViews: link.trackViews,
        table: tb,
        fields: fields.map((f) => ({ ...f, options: JSON.parse(f.options || '{}') })),
        records: records.map((r) => ({ ...r, data: JSON.parse(r.dataJson || '{}') })),
      });
      return;
    }
    if (link.resourceType === 'html') {
      const preview = await prisma.htmlPreview.findUnique({
        where: { id: link.resourceId, deletedAt: null},
        select: { id: true, title: true, entryPath: true },
      });
      if (!preview) throw new HttpError(404, 'HTML 预览不存在', 'NOT_FOUND');
      res.json({ resourceType: 'html', role: link.role, requireLogin: link.requireLogin, trackViews: link.trackViews, html: preview });
      return;
    }
    throw new HttpError(400, '资源类型不支持', 'BAD_TYPE');
  }),
);

// 公共知识库文档默认人人可编辑（见 docAccess 的 publicDefaultWrite），分享链接同步开放：
// 在公共文档上有写权限的人也可创建分享链接；被作者明确设为「仅查看」的人不行。
function canSharePublicDoc(
  user: { id: string; role: string },
  res: Awaited<ReturnType<typeof loadResource>>,
): boolean {
  if (res.kind !== 'doc') return false;
  const access = computeAccess(user, res.doc, { publicDefaultWrite: true });
  return access.isPublic && access.canWrite;
}

shareRouter.use(requireAuth, requireEmailVerified);

shareRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        resourceType: z.enum(['doc', 'table', 'html']),
        resourceId: z.string(),
        role: z.enum(['view', 'edit']).default('view'),
        requireLogin: z.boolean().default(false),
        trackViews: z.boolean().default(false),
        expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
      })
      .parse(req.body);
    const resource = await loadResource(body.resourceType, body.resourceId);
    const ownership = isOwnerOrEditor(req.user!.id, resource);
    if (ownership !== 'owner' && !canSharePublicDoc(req.user!, resource)) {
      throw new HttpError(403, '只有所有者可以创建分享链接', 'FORBIDDEN');
    }
    // 同一资源的链接按「权限 × 是否记录观看」分组，每组最多一条有效链接，禁止重复创建。
    const existing = await prisma.shareLink.findFirst({
      where: {
        resourceType: body.resourceType,
        resourceId: body.resourceId,
        role: body.role,
        trackViews: body.trackViews,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    });
    if (existing) {
      res.status(409).json({ error: '同类型链接已存在', code: 'DUPLICATE_LINK', link: existing });
      return;
    }
    const expiresAt = body.expiresInDays
      ? new Date(Date.now() + body.expiresInDays * 86400_000)
      : null;
    const link = await prisma.shareLink.create({
      data: {
        token: nanoid(20),
        resourceType: body.resourceType,
        resourceId: body.resourceId,
        role: body.role,
        requireLogin: body.requireLogin || body.trackViews,
        trackViews: body.trackViews,
        expiresAt,
        createdById: req.user!.id,
      },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    });
    // 新链接默认把全体管理员放进查看人名单：不用每篇逐个指定；
    // 创建人可在观看记录里把某个管理员删掉（不删则默认可见）。
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
    for (const a of admins) {
      await prisma.shareLinkViewer
        .upsert({
          where: { linkId_userId: { linkId: link.id, userId: a.id } },
          update: {},
          create: { linkId: link.id, userId: a.id },
        })
        .catch(() => undefined);
    }
    // 勾选记录观看的仅查看文档/数据表链接自动进每日精选时间线（默认当天）。
    // 精选写入失败不拖垮分享创建。
    if (link.trackViews && link.role === 'view' && (body.resourceType === 'doc' || body.resourceType === 'table')) {
      await ensureDailyPick(link.id).catch(() => undefined);
    }
    void prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'CREATE_SHARE_LINK',
        target: body.resourceId,
        metaJson: JSON.stringify({ resourceType: body.resourceType, role: body.role }),
      },
    }).catch(() => undefined);
    res.json({ link });
  }),
);

shareRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        resourceType: z.enum(['doc', 'table', 'html']),
        resourceId: z.string(),
      })
      .parse(req.query);
    const resource = await loadResource(q.resourceType, q.resourceId);
    const ownership = isOwnerOrEditor(req.user!.id, resource);
    // 公共文档的普通编辑者经分享开放规则进来时，只看自己创建的链接
    const viaPublic = !ownership && canSharePublicDoc(req.user!, resource);
    // 非所有者可见范围 = 自己创建的链接（公共文档编辑者）∪ 被指定看数据的链接，取并集；
    // 注意公共文档下 viaPublic 对所有登录用户成立，不能因为走公开规则就漏掉被指定的链接。
    const mine = await prisma.shareLinkViewer.findMany({
      where: { userId: req.user!.id },
      select: { linkId: true },
    });
    const designatedIds = mine.map((m) => m.linkId);
    if (!ownership && !viaPublic && designatedIds.length === 0) {
      throw new HttpError(403, '无权查看', 'FORBIDDEN');
    }
    const list = await prisma.shareLink.findMany({
      where: {
        resourceType: q.resourceType,
        resourceId: q.resourceId,
        revokedAt: null,
        ...(ownership
          ? {}
          : {
              OR: [
                ...(viaPublic ? [{ createdById: req.user!.id }] : []),
                ...(designatedIds.length ? [{ id: { in: designatedIds } }] : []),
              ],
            }),
      },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, name: true, email: true } } },
    });
    res.json({ list });
  }),
);

shareRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const link = await prisma.shareLink.findUnique({ where: { id: req.params.id } });
    if (!link) throw new HttpError(404, '分享不存在', 'NOT_FOUND');
    // 链接创建者、资源所有者、管理员均可撤销（作者要能管自己文章被别人建的链接）
    if (link.createdById !== req.user!.id && req.user!.role !== 'ADMIN') {
      const resource = await loadResource(link.resourceType, link.resourceId);
      if (isOwnerOrEditor(req.user!.id, resource) !== 'owner') {
        throw new HttpError(403, '无权操作该分享', 'FORBIDDEN');
      }
    }
    await prisma.shareLink.update({
      where: { id: link.id },
      data: { revokedAt: new Date() },
    });
    void prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'REVOKE_SHARE_LINK',
        target: link.resourceId,
        metaJson: JSON.stringify({ linkId: link.id }),
      },
    }).catch(() => undefined);
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

// ===== 观看记录：开启 trackViews 的链接，观看者登录后在分享页上报阅读数据 =====
const viewHeartbeatSchema = z.object({
  visibleSec: z.number().int().min(0).max(7 * 24 * 3600),
  activeSec: z.number().int().min(0).max(7 * 24 * 3600),
  scrollSec: z.number().int().min(0).max(7 * 24 * 3600),
  maxScrollDepth: z.number().int().min(0).max(100),
  ended: z.boolean().default(false),
});

shareRouter.post(
  '/:token/view',
  asyncHandler(async (req, res) => {
    const link = await prisma.shareLink.findUnique({ where: { token: req.params.token } });
    if (!link || link.revokedAt) throw new HttpError(404, '分享链接无效或已被撤销', 'NOT_FOUND');
    if (link.expiresAt && link.expiresAt < new Date()) throw new HttpError(410, '分享链接已过期', 'EXPIRED');
    if (!link.trackViews) throw new HttpError(400, '该链接未开启观看记录', 'TRACK_OFF');
    const session = await prisma.shareViewSession.create({
      data: {
        linkId: link.id,
        userId: req.user!.id,
        userAgent: (req.headers['user-agent'] || '').slice(0, 200) || null,
      },
    });
    res.json({ session: { id: session.id } });
  }),
);

shareRouter.post(
  '/:token/view/:sessionId',
  asyncHandler(async (req, res) => {
    const body = viewHeartbeatSchema.parse(req.body);
    const session = await prisma.shareViewSession.findUnique({ where: { id: req.params.sessionId } });
    if (!session || session.userId !== req.user!.id) {
      throw new HttpError(404, '观看会话不存在', 'NOT_FOUND');
    }
    const link = await prisma.shareLink.findUnique({ where: { id: session.linkId } });
    if (!link || link.token !== req.params.token) {
      throw new HttpError(404, '观看会话不存在', 'NOT_FOUND');
    }
    await prisma.shareViewSession.update({
      where: { id: session.id },
      data: {
        visibleSec: Math.max(session.visibleSec, body.visibleSec),
        activeSec: Math.max(session.activeSec, body.activeSec),
        scrollSec: Math.max(session.scrollSec, body.scrollSec),
        maxScrollDepth: Math.max(session.maxScrollDepth, body.maxScrollDepth),
        lastSeenAt: new Date(),
        endedAt: body.ended ? new Date() : null,
      },
    });
    res.json({ ok: true });
  }),
);

async function canManageStatsViewers(
  user: { id: string; role: string },
  link: { createdById: string; resourceType: string; resourceId: string },
): Promise<boolean> {
  if (link.createdById === user.id || user.role === 'ADMIN') return true;
  const resource = await loadResource(link.resourceType as 'doc' | 'table', link.resourceId);
  return isOwnerOrEditor(user.id, resource) === 'owner';
}

shareRouter.get(
  '/views/:linkId',
  asyncHandler(async (req, res) => {
    const link = await prisma.shareLink.findUnique({ where: { id: req.params.linkId } });
    if (!link) throw new HttpError(404, '分享链接不存在', 'NOT_FOUND');
    const me = req.user!;
    const canManageViewers = await canManageStatsViewers(me, link);
    if (!canManageViewers) {
      const designated = await prisma.shareLinkViewer.findUnique({
        where: { linkId_userId: { linkId: link.id, userId: me.id } },
      });
      if (!designated) throw new HttpError(403, '无权查看观看记录', 'FORBIDDEN');
    }
    const sessions = await prisma.shareViewSession.findMany({
      where: { linkId: link.id },
      orderBy: { startedAt: 'desc' },
      take: 300,
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });
    type Agg = {
      user: (typeof sessions)[number]['user'];
      visits: number;
      visibleSec: number;
      activeSec: number;
      scrollSec: number;
      maxScrollDepth: number;
      lastSeenAt: Date;
    };
    const byUserMap = new Map<string, Agg>();
    for (const s of sessions) {
      const cur = byUserMap.get(s.userId);
      if (!cur) {
        byUserMap.set(s.userId, {
          user: s.user,
          visits: 1,
          visibleSec: s.visibleSec,
          activeSec: s.activeSec,
          scrollSec: s.scrollSec,
          maxScrollDepth: s.maxScrollDepth,
          lastSeenAt: s.lastSeenAt,
        });
      } else {
        cur.visits += 1;
        cur.visibleSec += s.visibleSec;
        cur.activeSec += s.activeSec;
        cur.scrollSec += s.scrollSec;
        cur.maxScrollDepth = Math.max(cur.maxScrollDepth, s.maxScrollDepth);
        if (s.lastSeenAt > cur.lastSeenAt) cur.lastSeenAt = s.lastSeenAt;
      }
    }
    const byUser = [...byUserMap.values()].sort((a, b) => b.activeSec - a.activeSec);
    const avgActiveSec = sessions.length
      ? Math.round(sessions.reduce((sum, s) => sum + s.activeSec, 0) / sessions.length)
      : 0;
    res.json({
      link: { id: link.id, trackViews: link.trackViews, role: link.role, createdAt: link.createdAt },
      summary: { viewers: byUser.length, visits: sessions.length, avgActiveSec },
      byUser,
      sessions,
      canManageViewers,
    });
  }),
);

// 指定查看人：列表（仅管理者：链接创建者/资源所有者/管理员）
shareRouter.get(
  '/views/:linkId/viewers',
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const link = await prisma.shareLink.findUnique({ where: { id: req.params.linkId } });
    if (!link) throw new HttpError(404, '分享链接不存在', 'NOT_FOUND');
    if (!(await canManageStatsViewers(me, link))) {
      throw new HttpError(403, '无权管理查看人', 'FORBIDDEN');
    }
    const rows = await prisma.shareLinkViewer.findMany({
      where: { linkId: link.id },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ viewers: rows.map((r) => r.user) });
  }),
);

// 指定查看人：添加
shareRouter.post(
  '/views/:linkId/viewers',
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const body = z.object({ userId: z.string() }).parse(req.body);
    const link = await prisma.shareLink.findUnique({ where: { id: req.params.linkId } });
    if (!link) throw new HttpError(404, '分享链接不存在', 'NOT_FOUND');
    if (!(await canManageStatsViewers(me, link))) {
      throw new HttpError(403, '无权管理查看人', 'FORBIDDEN');
    }
    const target = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!target) throw new HttpError(404, '用户不存在', 'NOT_FOUND');
    await prisma.shareLinkViewer.upsert({
      where: { linkId_userId: { linkId: link.id, userId: target.id } },
      create: { linkId: link.id, userId: target.id },
      update: {},
    });
    res.json({ ok: true });
  }),
);

// 指定查看人：移除
shareRouter.delete(
  '/views/:linkId/viewers/:userId',
  asyncHandler(async (req, res) => {
    const me = req.user!;
    const link = await prisma.shareLink.findUnique({ where: { id: req.params.linkId } });
    if (!link) throw new HttpError(404, '分享链接不存在', 'NOT_FOUND');
    if (!(await canManageStatsViewers(me, link))) {
      throw new HttpError(403, '无权管理查看人', 'FORBIDDEN');
    }
    await prisma.shareLinkViewer.deleteMany({
      where: { linkId: link.id, userId: req.params.userId },
    });
    res.json({ ok: true });
  }),
);
