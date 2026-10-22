import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';

export const preferencesRouter = Router();
preferencesRouter.use(requireAuth);

const prefSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).optional(),
  themeColor: z
    .string()
    .trim()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, '主题色必须是十六进制颜色')
    .optional(),
  defaultHome: z.string().min(1).max(80).optional(),
  editorFontFamily: z.string().max(60).nullable().optional(),
  editorFontSize: z.number().int().min(12).max(28).optional(),
  autoSaveSeconds: z.number().int().min(1).max(60).optional(),
  notifyInApp: z.boolean().optional(),
  notifyEmail: z.boolean().optional(),
  calendarDefaultRemind: z.number().int().min(0).max(60 * 24 * 7).optional(),
  language: z.enum(['zh-CN', 'en', 'zh-HK']).optional(),
  mailListPageSize: z.number().int().min(10).max(100).optional(),
  mailSyncLimit: z.number().int().min(10).max(200).optional(),
});

const DEFAULTS = {
  theme: 'system',
  themeColor: '#5E5CE6',
  defaultHome: '/app/docs',
  editorFontFamily: null as string | null,
  editorFontSize: 16,
  autoSaveSeconds: 1,
  notifyInApp: true,
  notifyEmail: false,
  calendarDefaultRemind: 15,
  language: 'zh-CN',
  mailListPageSize: 30,
  mailSyncLimit: 50,
};

preferencesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const p = await prisma.userPreferences.findUnique({ where: { userId: req.user!.id } });
    if (!p) {
      res.json({ preferences: { ...DEFAULTS } });
      return;
    }
    res.json({ preferences: p });
  }),
);

preferencesRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const body = prefSchema.parse(req.body);
    const p = await prisma.userPreferences.upsert({
      where: { userId: req.user!.id },
      update: body,
      create: { userId: req.user!.id, ...body },
    });
    res.json({ preferences: p });
  }),
);
