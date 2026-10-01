import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireEmailVerified } from '../middleware/requireEmailVerified.js';
import {
  MEMORY_KINDS,
  listProjects,
  loadProjectWithAccess,
  renderProjectMarkdown,
  serializeItem,
} from '../lib/memoryAccess.js';
import {
  createItem,
  createProject,
  listItems,
  softDeleteItem,
  softDeleteProject,
  updateItem,
  updateProject,
} from '../lib/memoryService.js';

export const memoryRouter = Router();
memoryRouter.use(requireAuth, requireEmailVerified);

const KindSchema = z.enum(MEMORY_KINDS);
const TagsSchema = z.array(z.string().trim().max(40)).max(20);

memoryRouter.get(
  '/projects',
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const q = z
      .object({
        tab: z.enum(['mine', 'public', 'shared', 'all']).default('mine'),
        q: z.string().trim().max(120).optional(),
      })
      .parse(req.query);
    const all = await listProjects(req.user!, 'all', q.q || undefined);
    const counts = {
      mine: all.filter((p) => p.scope === 'mine').length,
      public: all.filter((p) => p.scope === 'public').length,
      shared: all.filter((p) => p.scope === 'shared').length,
    };
    const list = q.tab === 'all' ? all : all.filter((p) => p.scope === q.tab);
    res.json({ list, counts });
  }),
);

memoryRouter.post(
  '/projects',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(80),
        description: z.string().trim().max(2000).nullable().optional(),
        workspaceKind: z.enum(['PRIVATE', 'PUBLIC']).optional(),
        workspaceId: z.string().optional(),
      })
      .parse(req.body);
    const project = await createProject(req.user!, body);
    res.json({ project });
  }),
);

memoryRouter.get(
  '/projects/:id',
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const { project, access } = await loadProjectWithAccess(req.user!, req.params.id);
    const createdBy = await prisma.user.findUnique({
      where: { id: project.createdById },
      select: { id: true, name: true, email: true, avatarUrl: true },
    });
    const { permissions: _p, ...rest } = project;
    res.json({ project: { ...rest, createdBy }, access });
  }),
);

memoryRouter.patch(
  '/projects/:id',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(80).optional(),
        description: z.string().trim().max(2000).nullable().optional(),
      })
      .parse(req.body);
    const project = await updateProject(req.user!, req.params.id, body);
    res.json({ project });
  }),
);

memoryRouter.delete(
  '/projects/:id',
  asyncHandler(async (req, res) => {
    await softDeleteProject(req.user!, req.params.id);
    res.json({ ok: true });
  }),
);

memoryRouter.get(
  '/projects/:id/items',
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const { project } = await loadProjectWithAccess(req.user!, req.params.id);
    const q = z
      .object({
        kind: KindSchema.optional(),
        q: z.string().trim().max(200).optional(),
        pinned: z.enum(['1', 'true', '0', 'false']).optional(),
      })
      .parse(req.query);
    const items = await listItems(project.id, {
      kind: q.kind,
      q: q.q || undefined,
      pinnedOnly: q.pinned === '1' || q.pinned === 'true',
    });
    res.json({ items: items.map(serializeItem) });
  }),
);

memoryRouter.get(
  '/projects/:id/markdown',
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const { project } = await loadProjectWithAccess(req.user!, req.params.id);
    const pinnedOnly = req.query.all !== '1';
    const items = await listItems(project.id, { pinnedOnly });
    res.json({ markdown: renderProjectMarkdown(project, items), count: items.length, pinnedOnly });
  }),
);

const ItemCreateSchema = z.object({
  kind: KindSchema.default('note'),
  title: z.string().trim().max(200).nullable().optional(),
  content: z.string().trim().min(1).max(20_000),
  pinned: z.boolean().optional(),
  tags: TagsSchema.optional(),
  source: z.string().trim().max(80).nullable().optional(),
});

memoryRouter.post(
  '/projects/:id/items',
  asyncHandler(async (req, res) => {
    const body = ItemCreateSchema.parse(req.body);
    const item = await createItem(req.user!, req.params.id, { ...body, source: body.source ?? 'web' });
    res.json({ item });
  }),
);

memoryRouter.patch(
  '/projects/:id/items/:itemId',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        kind: KindSchema.optional(),
        title: z.string().trim().max(200).nullable().optional(),
        content: z.string().trim().min(1).max(20_000).optional(),
        pinned: z.boolean().optional(),
        tags: TagsSchema.optional(),
        source: z.string().trim().max(80).nullable().optional(),
      })
      .parse(req.body);
    const item = await updateItem(req.user!, req.params.id, req.params.itemId, body);
    res.json({ item });
  }),
);

memoryRouter.delete(
  '/projects/:id/items/:itemId',
  asyncHandler(async (req, res) => {
    await softDeleteItem(req.user!, req.params.id, req.params.itemId);
    res.json({ ok: true });
  }),
);

// ---- 协作者（与 doc.ts collaborators 一致）----
const userSelect = { id: true, email: true, name: true, avatarUrl: true } as const;

memoryRouter.get(
  '/projects/:id/collaborators',
  asyncHandler(async (req, res) => {
    const { project } = await loadProjectWithAccess(req.user!, req.params.id);
    const perms = await prisma.memoryProjectPermission.findMany({
      where: { projectId: project.id },
      include: { user: { select: userSelect } },
      orderBy: { createdAt: 'asc' },
    });
    const owner = await prisma.user.findUnique({ where: { id: project.createdById }, select: userSelect });
    res.json({ owner, collaborators: perms });
  }),
);

memoryRouter.post(
  '/projects/:id/collaborators',
  asyncHandler(async (req, res) => {
    const { project, access } = await loadProjectWithAccess(req.user!, req.params.id);
    if (!access.canInvite) throw new HttpError(403, '只有所有者可邀请协作者', 'FORBIDDEN');
    const body = z
      .object({
        userId: z.string().optional(),
        email: z.string().email().optional(),
        role: z.enum(['VIEWER', 'EDITOR']).default('VIEWER'),
      })
      .refine((v) => v.userId || v.email, '需要 userId 或 email')
      .parse(req.body);
    const user = body.userId
      ? await prisma.user.findUnique({ where: { id: body.userId } })
      : await prisma.user.findUnique({ where: { email: body.email!.toLowerCase() } });
    if (!user) throw new HttpError(404, '找不到该用户', 'USER_NOT_FOUND');
    if (user.id === project.createdById) {
      throw new HttpError(400, '不能添加项目创建者本人', 'INVALID');
    }
    const perm = await prisma.memoryProjectPermission.upsert({
      where: { projectId_userId: { projectId: project.id, userId: user.id } },
      update: { role: body.role },
      create: { projectId: project.id, userId: user.id, role: body.role },
      include: { user: { select: userSelect } },
    });
    res.json({ collaborator: perm });
  }),
);

memoryRouter.patch(
  '/projects/:id/collaborators/:userId',
  asyncHandler(async (req, res) => {
    const { project, access } = await loadProjectWithAccess(req.user!, req.params.id);
    if (!access.canInvite) throw new HttpError(403, '只有所有者可调整协作者权限', 'FORBIDDEN');
    const body = z.object({ role: z.enum(['VIEWER', 'EDITOR']) }).parse(req.body);
    const perm = await prisma.memoryProjectPermission.update({
      where: { projectId_userId: { projectId: project.id, userId: req.params.userId } },
      data: { role: body.role },
      include: { user: { select: userSelect } },
    });
    res.json({ collaborator: perm });
  }),
);

memoryRouter.delete(
  '/projects/:id/collaborators/:userId',
  asyncHandler(async (req, res) => {
    const { project, access } = await loadProjectWithAccess(req.user!, req.params.id);
    if (!access.canInvite) throw new HttpError(403, '只有所有者可移除协作者', 'FORBIDDEN');
    await prisma.memoryProjectPermission
      .delete({ where: { projectId_userId: { projectId: project.id, userId: req.params.userId } } })
      .catch(() => {
        throw new HttpError(404, '协作者不存在', 'NOT_FOUND');
      });
    res.json({ ok: true });
  }),
);
