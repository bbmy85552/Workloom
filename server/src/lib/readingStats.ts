import { prisma } from '../prisma.js';
import { HttpError } from './asyncHandler.js';

// 阅读统计共享逻辑（管理后台 REST 接口与 MCP 阅读工具共用）。
// 分母口径以 /reading/by-company 为准：只算每日精选时间线里实际放出来的文章。
// 已读＝打开过（有 ≥1 条 ShareViewSession）；判定（已读完/认真阅读等）是前端算的，
// 这里只给原始聚合数据，不另发明判定。

// 标题解析：照 routes/dailyPicks.ts 的 resolveTitles 模式（doc/table/html 三类）。
export async function resolveReadingTitles(
  links: Array<{ resourceType: string; resourceId: string }>,
): Promise<Map<string, string>> {
  const docIds = [...new Set(links.filter((l) => l.resourceType === 'doc').map((l) => l.resourceId))];
  const tableIds = [...new Set(links.filter((l) => l.resourceType === 'table').map((l) => l.resourceId))];
  const htmlIds = [...new Set(links.filter((l) => l.resourceType === 'html').map((l) => l.resourceId))];
  const docs = docIds.length
    ? await prisma.document.findMany({
        where: { id: { in: docIds }, deletedAt: null },
        select: { id: true, title: true },
      })
    : [];
  const tables = tableIds.length
    ? await prisma.tableBase.findMany({
        where: { id: { in: tableIds } },
        select: { id: true, name: true },
      })
    : [];
  const htmls = htmlIds.length
    ? await prisma.htmlPreview.findMany({
        where: { id: { in: htmlIds }, deletedAt: null },
        select: { id: true, title: true },
      })
    : [];
  const map = new Map<string, string>();
  for (const d of docs) map.set(`doc:${d.id}`, d.title);
  for (const t of tables) map.set(`table:${t.id}`, t.name);
  for (const h of htmls) map.set(`html:${h.id}`, h.title);
  return map;
}

export interface LiveTimelineLink {
  id: string;
  token: string;
  resourceType: string;
  resourceId: string;
  role: string;
  trackViews: boolean;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  createdById: string;
  creatorName: string;
  title: string;
}

// 分母口径（与 /reading/by-company 完全一致）：有 DailyPick 行、trackViews、
// 未撤销、role 必须是 view、未过期、资源仍可解析（有标题）。
export async function getLiveTimelineLinks(now: Date = new Date()): Promise<LiveTimelineLink[]> {
  const picks = await prisma.dailyPick.findMany({
    select: { shareLinkId: true },
  });
  const pickLinkIds = [...new Set(picks.map((p) => p.shareLinkId))];
  if (pickLinkIds.length === 0) return [];
  const links = await prisma.shareLink.findMany({
    where: { id: { in: pickLinkIds }, trackViews: true, revokedAt: null },
    include: { createdBy: { select: { name: true } } },
  });
  const active = links.filter(
    (l) =>
      l.role === 'view' &&
      (l.resourceType === 'doc' || l.resourceType === 'table' || l.resourceType === 'html') &&
      (!l.expiresAt || l.expiresAt > now),
  );
  const titles = await resolveReadingTitles(active);
  return active
    .filter((l) => titles.has(`${l.resourceType}:${l.resourceId}`))
    .map((l) => ({
      id: l.id,
      token: l.token,
      resourceType: l.resourceType,
      resourceId: l.resourceId,
      role: l.role,
      trackViews: l.trackViews,
      expiresAt: l.expiresAt,
      revokedAt: l.revokedAt,
      createdAt: l.createdAt,
      createdById: l.createdById,
      creatorName: l.createdBy.name,
      title: titles.get(`${l.resourceType}:${l.resourceId}`)!,
    }));
}

export interface SessionAgg {
  visits: number;
  visibleSec: number;
  activeSec: number;
  scrollSec: number;
  maxScrollDepth: number;
  lastSeenAt: Date;
}

// 照 /reading/:linkId 的 byUserMap 原样抽出：把指定链接的全部会话按人聚合。
export async function aggregateSessionsByUser(linkIds: string[]): Promise<Map<string, SessionAgg>> {
  const sessions = await prisma.shareViewSession.findMany({
    where: { linkId: { in: linkIds } },
    orderBy: { startedAt: 'desc' },
    take: 300,
  });
  const byUserMap = new Map<string, SessionAgg>();
  for (const s of sessions) {
    const cur = byUserMap.get(s.userId);
    if (!cur) {
      byUserMap.set(s.userId, {
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
  return byUserMap;
}

// 每人读过几篇 live 文章（按 (linkId, userId) 去重计数），与 by-company 的 groupBy 口径一致。
export async function countReadLinksByUser(linkIds: string[]): Promise<Map<string, number>> {
  if (linkIds.length === 0) return new Map();
  const rows = await prisma.shareViewSession.groupBy({
    by: ['linkId', 'userId'],
    where: { linkId: { in: linkIds } },
  });
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.userId, (map.get(row.userId) ?? 0) + 1);
  }
  return map;
}

export interface ReadingUser {
  id: string;
  name: string;
  email: string;
  company: string | null;
}

// 全部用户，公司名排序（未设置排最后），同公司按邮箱排。
// 对外显示的 name 用公司名（与管理后台阅读统计页一致：company ?? '未设置'），
// 平台用户名跟 Google 账号走、认不出人，不再外露；email 仍保留，供同公司多账号区分。
export async function listReadingUsers(): Promise<ReadingUser[]> {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, company: true },
  });
  users.sort((a, b) => {
    if (a.company === null && b.company !== null) return 1;
    if (a.company !== null && b.company === null) return -1;
    if (a.company !== null && b.company !== null && a.company !== b.company) {
      return a.company.localeCompare(b.company);
    }
    return a.email.localeCompare(b.email);
  });
  return users.map((u) => ({ id: u.id, name: u.company ?? '未设置', email: u.email, company: u.company }));
}

export function assertReadingAdmin(user: { role: string }): void {
  if (user.role !== 'ADMIN') throw new HttpError(403, '仅管理员可用', 'FORBIDDEN');
}
