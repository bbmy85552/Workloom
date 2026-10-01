import { prisma } from '../prisma.js';
import { HttpError } from './asyncHandler.js';
import {
  assertProjectWrite,
  loadProjectWithAccess,
  normalizeTags,
  resolveProjectWorkspace,
  serializeItem,
  type MemoryKind,
} from './memoryAccess.js';

type AccessUser = { id: string; role: string };

export interface CreateProjectInput {
  name: string;
  description?: string | null;
  workspaceKind?: 'PRIVATE' | 'PUBLIC';
  workspaceId?: string;
}

export async function createProject(user: AccessUser, input: CreateProjectInput) {
  const ws = await resolveProjectWorkspace(user.id, input);
  return prisma.memoryProject.create({
    data: {
      workspaceId: ws.id,
      name: input.name,
      description: input.description ?? null,
      createdById: user.id,
    },
    include: { workspace: { select: { id: true, name: true, kind: true, ownerId: true } } },
  });
}

export async function updateProject(
  user: AccessUser,
  projectId: string,
  input: { name?: string; description?: string | null },
) {
  const { project, access } = await loadProjectWithAccess(user, projectId);
  assertProjectWrite(access);
  return prisma.memoryProject.update({
    where: { id: project.id },
    data: { name: input.name, description: input.description },
    include: { workspace: { select: { id: true, name: true, kind: true, ownerId: true } } },
  });
}

export async function softDeleteProject(user: AccessUser, projectId: string) {
  const { project, access } = await loadProjectWithAccess(user, projectId);
  if (!access.canDelete) throw new HttpError(403, '没有删除权限', 'FORBIDDEN');
  await prisma.memoryProject.update({ where: { id: project.id }, data: { deletedAt: new Date() } });
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: 'MEMORY_PROJECT_DELETE',
      target: project.id,
      metaJson: JSON.stringify({ name: project.name, workspaceKind: project.workspace.kind }),
    },
  });
  return project;
}

export interface ListItemsInput {
  kind?: MemoryKind;
  q?: string;
  pinnedOnly?: boolean;
  limit?: number;
}

const itemInclude = {
  createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
  updatedBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
} as const;

export async function listItems(projectId: string, input: ListItemsInput = {}) {
  const items = await prisma.memoryItem.findMany({
    where: {
      projectId,
      deletedAt: null,
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.pinnedOnly ? { pinned: true } : {}),
      ...(input.q
        ? {
            OR: [
              { title: { contains: input.q } },
              { content: { contains: input.q } },
              { tags: { contains: input.q } },
            ],
          }
        : {}),
    },
    include: itemInclude,
    orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    take: input.limit ?? 1000,
  });
  return items;
}

export interface CreateItemInput {
  kind: MemoryKind;
  title?: string | null;
  content: string;
  pinned?: boolean;
  tags?: string[];
  source?: string | null;
}

async function touchProject(projectId: string) {
  await prisma.memoryProject.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
}

export async function createItem(user: AccessUser, projectId: string, input: CreateItemInput) {
  const { project, access } = await loadProjectWithAccess(user, projectId);
  assertProjectWrite(access);
  const item = await prisma.memoryItem.create({
    data: {
      projectId: project.id,
      kind: input.kind,
      title: input.title?.trim() || null,
      content: input.content,
      pinned: input.pinned ?? true,
      tags: normalizeTags(input.tags) ?? '[]',
      source: input.source?.trim() || null,
      createdById: user.id,
      updatedById: user.id,
    },
    include: itemInclude,
  });
  await touchProject(project.id);
  return serializeItem(item);
}

/** 确认条目属于该项目且未被删除，防止跨项目越权修改。 */
async function loadItemInProject(projectId: string, itemId: string) {
  const item = await prisma.memoryItem.findFirst({
    where: { id: itemId, projectId, deletedAt: null },
  });
  if (!item) throw new HttpError(404, '记忆条目不存在', 'ITEM_NOT_FOUND');
  return item;
}

export interface UpdateItemInput {
  kind?: MemoryKind;
  title?: string | null;
  content?: string;
  pinned?: boolean;
  tags?: string[];
  source?: string | null;
}

export async function updateItem(user: AccessUser, projectId: string, itemId: string, input: UpdateItemInput) {
  const { project, access } = await loadProjectWithAccess(user, projectId);
  assertProjectWrite(access);
  const existing = await loadItemInProject(project.id, itemId);
  const item = await prisma.memoryItem.update({
    where: { id: existing.id },
    data: {
      kind: input.kind,
      title: input.title === undefined ? undefined : input.title?.trim() || null,
      content: input.content,
      pinned: input.pinned,
      tags: normalizeTags(input.tags),
      source: input.source === undefined ? undefined : input.source?.trim() || null,
      updatedById: user.id,
    },
    include: itemInclude,
  });
  await touchProject(project.id);
  return serializeItem(item);
}

export async function softDeleteItem(user: AccessUser, projectId: string, itemId: string) {
  const { project, access } = await loadProjectWithAccess(user, projectId);
  assertProjectWrite(access);
  const existing = await loadItemInProject(project.id, itemId);
  await prisma.memoryItem.update({
    where: { id: existing.id },
    data: { deletedAt: new Date(), updatedById: user.id },
  });
  await touchProject(project.id);
  return { ok: true, id: existing.id };
}

/** 跨所有可访问项目（或指定项目）做关键字搜索。 */
export async function searchItems(
  user: AccessUser,
  input: { q: string; projectId?: string; kind?: MemoryKind; limit?: number },
  accessibleProjectIds: string[],
) {
  let projectIds = accessibleProjectIds;
  if (input.projectId) {
    const { project } = await loadProjectWithAccess(user, input.projectId);
    projectIds = [project.id];
  }
  if (projectIds.length === 0) return [];
  const items = await prisma.memoryItem.findMany({
    where: {
      projectId: { in: projectIds },
      deletedAt: null,
      project: { deletedAt: null },
      ...(input.kind ? { kind: input.kind } : {}),
      OR: [
        { title: { contains: input.q } },
        { content: { contains: input.q } },
        { tags: { contains: input.q } },
      ],
    },
    include: { project: { select: { id: true, name: true } } },
    orderBy: { updatedAt: 'desc' },
    take: input.limit ?? 50,
  });
  return items.map(serializeItem);
}
