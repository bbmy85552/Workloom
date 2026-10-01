import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireEmailVerified } from '../middleware/requireEmailVerified.js';

export const recentRouter = Router();
recentRouter.use(requireAuth, requireEmailVerified);

recentRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(30),
        type: z.enum(['all', 'doc', 'table', 'event']).default('all'),
      })
      .parse(req.query);
    const userId = req.user!.id;

    const items: Array<{
      type: 'doc' | 'table' | 'event';
      id: string;
      title: string;
      updatedAt: string;
      meta?: Record<string, unknown>;
    }> = [];

    if (q.type === 'all' || q.type === 'doc') {
      const docs = await prisma.document.findMany({
        where: {
          isArchived: false,
          deletedAt: null,
          OR: [{ createdById: userId }, { permissions: { some: { userId } } }],
        },
        orderBy: { updatedAt: 'desc' },
        take: q.limit,
        select: {
          id: true,
          title: true,
          updatedAt: true,
          workspace: { select: { id: true, name: true, kind: true } },
        },
      });
      for (const d of docs) {
        items.push({
          type: 'doc',
          id: d.id,
          title: d.title,
          updatedAt: d.updatedAt.toISOString(),
          meta: { workspace: d.workspace },
        });
      }
    }
    if (q.type === 'all' || q.type === 'table') {
      const myWs = await prisma.workspace.findMany({
        where: { ownerId: userId },
        select: { id: true },
      });
      const tables = await prisma.tableBase.findMany({
        where: {
          OR: [
            { workspaceId: { in: myWs.map((w) => w.id) } },
            { permissions: { some: { userId } } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: q.limit,
        select: { id: true, name: true, updatedAt: true },
      });
      for (const t of tables) {
        items.push({
          type: 'table',
          id: t.id,
          title: t.name,
          updatedAt: t.updatedAt.toISOString(),
        });
      }
    }
    if (q.type === 'all' || q.type === 'event') {
      const events = await prisma.calendarEvent.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: q.limit,
        select: { id: true, title: true, updatedAt: true, startAt: true },
      });
      for (const e of events) {
        items.push({
          type: 'event',
          id: e.id,
          title: e.title,
          updatedAt: e.updatedAt.toISOString(),
          meta: { startAt: e.startAt.toISOString() },
        });
      }
    }

    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    res.json({ list: items.slice(0, q.limit) });
  }),
);
