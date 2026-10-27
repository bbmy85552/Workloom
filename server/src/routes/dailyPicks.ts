import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../lib/asyncHandler.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { ensureDailyPick, isValidDateString, shanghaiDate } from '../lib/dailyPicks.js';

// 每日精选时间线：只收「仅查看 + 勾选记录观看」的文档/数据表分享链接。
// HTML 预览的分享页不跑观看心跳（SharePage 只对 doc/table 启动跟踪），
// 所以 HTML 链接不进时间线，避免卡片承诺了记录却记不到。
// 卡片点开的是分享链接本身，滚动与阅读时长由现有的分享跟踪记。

export const dailyPicksRouter = Router();
dailyPicksRouter.use(requireAuth);

type PickLink = {
  id: string;
  token: string;
  resourceType: string;
  resourceId: string;
  role: string;
  trackViews: boolean;
  requireLogin: boolean;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdById: string;
  createdAt: Date;
  createdBy: { id: string; name: string; email: string };
};

function isLinkActive(link: PickLink, now: Date): boolean {
  return (
    link.trackViews &&
    link.role === 'view' &&
    (link.resourceType === 'doc' || link.resourceType === 'table') &&
    !link.revokedAt &&
    (!link.expiresAt || link.expiresAt > now)
  );
}

async function resolveTitles(links: PickLink[]) {
  const docIds = [...new Set(links.filter((l) => l.resourceType === 'doc').map((l) => l.resourceId))];
  const tableIds = [...new Set(links.filter((l) => l.resourceType === 'table').map((l) => l.resourceId))];
  const docs = docIds.length
    ? await prisma.document.findMany({
        where: { id: { in: docIds }, deletedAt: null },
        select: { id: true, title: true, createdById: true, workspace: { select: { ownerId: true } } },
      })
    : [];
  const tables = tableIds.length
    ? await prisma.tableBase.findMany({
        where: { id: { in: tableIds } },
        select: { id: true, name: true, createdById: true, workspace: { select: { ownerId: true } } },
      })
    : [];
  const map = new Map<string, { title: string; ownerId: string }>();
  for (const d of docs) map.set(`doc:${d.id}`, { title: d.title, ownerId: d.workspace.ownerId });
  for (const t of tables) map.set(`table:${t.id}`, { title: t.name, ownerId: t.workspace.ownerId });
  return map;
}

async function designatedSet(linkIds: string[]) {
  if (!linkIds.length) return new Set<string>();
  const rows = await prisma.shareLinkViewer.findMany({
    where: { linkId: { in: linkIds } },
    select: { linkId: true, userId: true },
  });
  return new Set(rows.map((r) => `${r.linkId}:${r.userId}`));
}

// 时间线列表：所有登录用户可见，按日期倒序、同天内按顺序。
dailyPicksRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const now = new Date();
    const picks = await prisma.dailyPick.findMany({
      orderBy: [{ featuredDate: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { link: { include: { createdBy: { select: { id: true, name: true, email: true } } } } },
    });
    const active = picks.filter((p) => isLinkActive(p.link as PickLink, now));
    const titles = await resolveTitles(active.map((p) => p.link as PickLink));
    const designated = await designatedSet(active.map((p) => p.link.id));
    const me = req.user!;
    const list = active
      .filter((p) => titles.has(`${p.link.resourceType}:${p.link.resourceId}`))
      .map((p) => {
        const link = p.link as PickLink;
        const info = titles.get(`${link.resourceType}:${link.resourceId}`)!;
        const canViewStats =
          me.role === 'ADMIN' ||
          link.createdById === me.id ||
          info.ownerId === me.id ||
          designated.has(`${link.id}:${me.id}`);
        return {
          id: p.id,
          featuredDate: p.featuredDate,
          sortOrder: p.sortOrder,
          linkId: link.id,
          token: link.token,
          resourceType: link.resourceType as 'doc' | 'table',
          resourceId: link.resourceId,
          title: info.title,
          createdByName: link.createdBy.name,
          linkCreatedAt: link.createdAt,
          expiresAt: link.expiresAt,
          canViewStats,
        };
      });
    res.json({ list });
  }),
);

// 可加入时间线的记录链接（管理员）：已是精选的不再列出。
dailyPicksRouter.get(
  '/available',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const [links, picks] = await Promise.all([
      prisma.shareLink.findMany({
        orderBy: { createdAt: 'desc' },
        include: { createdBy: { select: { id: true, name: true, email: true } } },
      }),
      prisma.dailyPick.findMany({ select: { shareLinkId: true } }),
    ]);
    const picked = new Set(picks.map((p) => p.shareLinkId));
    const candidates = links.filter((l) => !picked.has(l.id) && isLinkActive(l as PickLink, now));
    const titles = await resolveTitles(candidates as PickLink[]);
    const list = candidates
      .filter((l) => titles.has(`${l.resourceType}:${l.resourceId}`))
      .map((l) => ({
        linkId: l.id,
        token: l.token,
        resourceType: l.resourceType as 'doc' | 'table',
        resourceId: l.resourceId,
        title: titles.get(`${l.resourceType}:${l.resourceId}`)!.title,
        createdByName: l.createdBy.name,
        linkCreatedAt: l.createdAt,
      }));
    res.json({ list });
  }),
);

// 一次性回填：把功能上线前已建的记录链接按创建日归进时间线。幂等。
dailyPicksRouter.post(
  '/backfill',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const links = await prisma.shareLink.findMany({ orderBy: { createdAt: 'asc' } });
    const existing = await prisma.dailyPick.findMany({ select: { shareLinkId: true } });
    const existingIds = new Set(existing.map((p) => p.shareLinkId));
    let added = 0;
    for (const link of links) {
      if (existingIds.has(link.id) || !isLinkActive(link as PickLink, now)) continue;
      await ensureDailyPick(link.id, shanghaiDate(link.createdAt));
      added += 1;
    }
    res.json({ ok: true, added });
  }),
);

// 管理员：把一条已有记录链接加进时间线（默认归链接创建日）。
dailyPicksRouter.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ shareLinkId: z.string(), featuredDate: z.string().optional() })
      .parse(req.body);
    if (body.featuredDate && !isValidDateString(body.featuredDate)) {
      throw new HttpError(400, '日期格式不正确', 'BAD_DATE');
    }
    const link = await prisma.shareLink.findUnique({ where: { id: body.shareLinkId } });
    if (!link || !isLinkActive(link as PickLink, new Date())) {
      throw new HttpError(400, '只有勾选记录观看的仅查看分享链接才能加入时间线', 'BAD_LINK');
    }
    const existing = await prisma.dailyPick.findUnique({ where: { shareLinkId: link.id } });
    if (existing) throw new HttpError(409, '这条链接已在时间线里', 'DUPLICATE_PICK');
    await ensureDailyPick(link.id, body.featuredDate ?? shanghaiDate(link.createdAt));
    const pick = await prisma.dailyPick.findUnique({ where: { shareLinkId: link.id } });
    res.json({ pick });
  }),
);

// 管理员：改归属日期，改到哪天就排到那天的最后。
dailyPicksRouter.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z.object({ featuredDate: z.string() }).parse(req.body);
    if (!isValidDateString(body.featuredDate)) {
      throw new HttpError(400, '日期格式不正确', 'BAD_DATE');
    }
    const pick = await prisma.dailyPick.findUnique({ where: { id: req.params.id } });
    if (!pick) throw new HttpError(404, '精选不存在', 'NOT_FOUND');
    if (pick.featuredDate === body.featuredDate) return res.json({ pick });
    const max = await prisma.dailyPick.findFirst({
      where: { featuredDate: body.featuredDate },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const updated = await prisma.dailyPick.update({
      where: { id: pick.id },
      data: { featuredDate: body.featuredDate, sortOrder: (max?.sortOrder ?? -1) + 1 },
    });
    res.json({ pick: updated });
  }),
);

// 管理员：同天内上移/下移。
dailyPicksRouter.post(
  '/:id/move',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = z.object({ direction: z.enum(['up', 'down']) }).parse(req.body);
    const pick = await prisma.dailyPick.findUnique({
      where: { id: req.params.id },
      include: { link: true },
    });
    if (!pick) throw new HttpError(404, '精选不存在', 'NOT_FOUND');
    const now = new Date();
    const day = await prisma.dailyPick.findMany({
      where: { featuredDate: pick.featuredDate },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { link: true },
    });
    const ordered = day.filter((p) => isLinkActive(p.link as PickLink, now));
    const idx = ordered.findIndex((p) => p.id === pick.id);
    if (idx < 0) throw new HttpError(404, '精选不存在', 'NOT_FOUND');
    const target = body.direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= ordered.length) return res.json({ ok: true, moved: false });
    const swapped = [...ordered];
    [swapped[idx], swapped[target]] = [swapped[target], swapped[idx]];
    await prisma.$transaction(
      swapped.map((p, i) => prisma.dailyPick.update({ where: { id: p.id }, data: { sortOrder: i } })),
    );
    res.json({ ok: true, moved: true });
  }),
);

// 管理员：只从时间线移出，分享链接本身不受影响。
dailyPicksRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const pick = await prisma.dailyPick.findUnique({ where: { id: req.params.id } });
    if (!pick) throw new HttpError(404, '精选不存在', 'NOT_FOUND');
    await prisma.dailyPick.delete({ where: { id: pick.id } });
    res.json({ ok: true });
  }),
);
