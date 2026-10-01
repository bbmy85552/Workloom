import { Router } from 'express';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireEmailVerified } from '../middleware/requireEmailVerified.js';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth, requireEmailVerified);

dashboardRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 3600 * 1000);
    const in7Days = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

    const [todayEvents, upcomingTodos, recentDocs, unreadNotif, favoriteDocs] =
      await Promise.all([
        prisma.calendarEvent.findMany({
          where: {
            userId,
            startAt: { gte: startOfDay, lt: endOfDay },
          },
          orderBy: { startAt: 'asc' },
          take: 10,
        }),
        prisma.todoItem.findMany({
          where: {
            userId,
            completedAt: null,
            dueDate: { gte: startOfDay, lt: in7Days },
          },
          orderBy: { dueDate: 'asc' },
          take: 8,
        }),
        prisma.document.findMany({
          where: {
            isArchived: false,
            deletedAt: null,
            OR: [
              { createdById: userId },
              { permissions: { some: { userId } } },
            ],
          },
          orderBy: { updatedAt: 'desc' },
          take: 8,
          select: {
            id: true,
            title: true,
            updatedAt: true,
            workspace: { select: { id: true, name: true, kind: true } },
          },
        }),
        prisma.notification.count({ where: { userId, readAt: null } }),
        prisma.documentFavorite.findMany({
          where: { userId, document: { isArchived: false, deletedAt: null } },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            document: {
              select: {
                id: true,
                title: true,
                updatedAt: true,
                workspace: { select: { id: true, name: true, kind: true } },
              },
            },
          },
        }),
      ]);

    res.json({
      todayEvents,
      upcomingTodos,
      recentDocs,
      unreadNotif,
      favoriteDocs: favoriteDocs
        .filter((f) => f.document)
        .map((f) => ({ ...f.document, favoritedAt: f.createdAt })),
      now: now.toISOString(),
    });
  }),
);
