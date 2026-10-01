import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireEmailVerified } from '../middleware/requireEmailVerified.js';

export const todoRouter = Router();
todoRouter.use(requireAuth, requireEmailVerified);

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function parseDate(s: string, label: string) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `${label} 时间格式无效`, 'INVALID');
  return d;
}

todoRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = z
      .object({ date: z.string().optional() })
      .parse(req.query);
    const where: any = { userId: req.user!.id };
    if (q.date) {
      const d = new Date(q.date);
      if (!Number.isNaN(d.getTime())) {
        where.dueDate = { gte: startOfDay(d), lte: endOfDay(d) };
      }
    }
    const list = await prisma.todoItem.findMany({
      where,
      orderBy: [{ completedAt: 'asc' }, { dueDate: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({ list });
  }),
);

todoRouter.get(
  '/today',
  asyncHandler(async (req, res) => {
    const now = new Date();
    const list = await prisma.todoItem.findMany({
      where: {
        userId: req.user!.id,
        OR: [
          { dueDate: { gte: startOfDay(now), lte: endOfDay(now) } },
          { dueDate: null, completedAt: null },
        ],
      },
      orderBy: [{ completedAt: 'asc' }, { dueDate: 'asc' }, { order: 'asc' }],
    });
    const completed = list.filter((t) => t.completedAt).length;
    const total = list.length;
    res.json({
      list,
      progress: {
        completed,
        total,
        percent: total === 0 ? 0 : Math.round((completed / total) * 100),
      },
    });
  }),
);

todoRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().trim().min(1).max(200),
        dueDate: z.string().nullable().optional(),
      })
      .parse(req.body);
    const todo = await prisma.todoItem.create({
      data: {
        userId: req.user!.id,
        title: body.title,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
      },
    });
    res.json({ todo });
  }),
);

todoRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const existing = await prisma.todoItem.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user!.id)
      throw new HttpError(404, '待办不存在', 'NOT_FOUND');
    const body = z
      .object({
        title: z.string().trim().min(1).max(200).optional(),
        dueDate: z.string().nullable().optional(),
        completed: z.boolean().optional(),
      })
      .parse(req.body);
    const todo = await prisma.todoItem.update({
      where: { id },
      data: {
        title: body.title,
        dueDate: body.dueDate === undefined ? undefined : body.dueDate ? new Date(body.dueDate) : null,
        completedAt:
          body.completed === undefined
            ? undefined
            : body.completed
              ? new Date()
              : null,
      },
    });
    res.json({ todo });
  }),
);

todoRouter.post(
  '/:id/schedule',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const existing = await prisma.todoItem.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user!.id)
      throw new HttpError(404, '待办不存在', 'NOT_FOUND');
    const body = z
      .object({
        startAt: z.string(),
        endAt: z.string(),
        allDay: z.boolean().optional(),
        color: z.string().max(20).nullable().optional(),
        reminderMinutes: z.number().int().min(0).max(60 * 24 * 14).nullable().optional(),
      })
      .parse(req.body);
    const startAt = parseDate(body.startAt, '开始');
    const endAt = parseDate(body.endAt, '结束');
    if (endAt < startAt) throw new HttpError(400, '结束时间不能早于开始时间', 'INVALID');
    const event = await prisma.calendarEvent.create({
      data: {
        userId: req.user!.id,
        title: existing.title,
        description: '由待办排入日历',
        startAt,
        endAt,
        allDay: body.allDay ?? false,
        color: body.color ?? '#34c759',
        reminderMinutes: body.reminderMinutes ?? null,
        relatedTodoId: existing.id,
      },
    });
    const todo = await prisma.todoItem.update({
      where: { id },
      data: { dueDate: startAt },
    });
    res.json({ event, todo });
  }),
);

todoRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const existing = await prisma.todoItem.findUnique({ where: { id } });
    if (!existing || existing.userId !== req.user!.id)
      throw new HttpError(404, '待办不存在', 'NOT_FOUND');
    await prisma.todoItem.delete({ where: { id } });
    res.json({ ok: true });
  }),
);
