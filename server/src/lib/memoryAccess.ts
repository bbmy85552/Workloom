import { prisma } from '../prisma.js';
import { HttpError } from './asyncHandler.js';
import { computeAccess, type DocAccess } from './docAccess.js';

export const MEMORY_KINDS = ['fact', 'decision', 'preference', 'note', 'todo'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const MEMORY_KIND_LABELS: Record<MemoryKind, string> = {
  fact: '事实',
  decision: '决策',
  preference: '偏好',
  note: '笔记',
  todo: '待办',
};

export type MemoryTab = 'mine' | 'public' | 'shared' | 'all';

type AccessUser = { id: string; role: string };

/** 加载项目记忆空间（过滤软删除），并复用知识库的 computeAccess 计算权限。 */
export async function loadProject(projectId: string) {
  const project = await prisma.memoryProject.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { workspace: true, permissions: true },
  });
  if (!project) throw new HttpError(404, '项目不存在', 'PROJECT_NOT_FOUND');
  return project;
}

export function computeProjectAccess(
  user: AccessUser,
  project: {
    createdById: string;
    workspace: { ownerId: string; kind: string };
    permissions: { userId: string; role: string }[];
  },
): DocAccess {
  return computeAccess(user, project);
}

export async function loadProjectWithAccess(user: AccessUser, projectId: string) {
  const project = await loadProject(projectId);
  const access = computeProjectAccess(user, project);
  if (!access.canRead) throw new HttpError(403, '无权访问该项目', 'FORBIDDEN');
  return { project, access };
}

export function assertProjectWrite(access: DocAccess) {
  if (!access.canWrite) throw new HttpError(403, '只读权限', 'READONLY');
}

/**
 * 解析创建项目的目标工作区。规则与 doc.ts 创建文档一致：
 * - 私人空间：只有空间 owner 可创建
 * - 公共空间（PUBLIC）：任何登录用户可创建
 */
export async function resolveProjectWorkspace(
  userId: string,
  opts: { workspaceId?: string; workspaceKind?: 'PRIVATE' | 'PUBLIC' },
) {
  if (opts.workspaceId) {
    const ws = await prisma.workspace.findUnique({ where: { id: opts.workspaceId } });
    if (!ws) throw new HttpError(404, '工作区不存在', 'NOT_FOUND');
    if (ws.kind === 'PRIVATE' && ws.ownerId !== userId) {
      throw new HttpError(403, '无权在此工作区创建项目', 'FORBIDDEN');
    }
    return ws;
  }
  if ((opts.workspaceKind ?? 'PRIVATE') === 'PUBLIC') {
    const ws = await prisma.workspace.findFirst({ where: { kind: 'PUBLIC' } });
    if (!ws) throw new HttpError(500, '公共知识库尚未初始化', 'PUBLIC_WS_MISSING');
    return ws;
  }
  const ws = await prisma.workspace.findFirst({
    where: { ownerId: userId, kind: 'PRIVATE' },
    orderBy: { createdAt: 'asc' },
  });
  if (ws) return ws;
  // 与 GET /api/workspaces 一致：没有私人空间时自动创建一个
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return prisma.workspace.create({ data: { name: `${user?.name ?? '我'} 的空间`, ownerId: userId } });
}

const projectListInclude = {
  workspace: { select: { id: true, name: true, kind: true, ownerId: true } },
  createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
  permissions: { select: { userId: true, role: true } },
  _count: { select: { items: { where: { deletedAt: null } } } },
} as const;

/** 按标签列出可访问的项目：mine=我的私人空间；public=公共空间；shared=别人私人空间里共享给我的。 */
export async function listProjects(user: AccessUser, tab: MemoryTab, q?: string) {
  const base = {
    deletedAt: null,
    ...(q ? { OR: [{ name: { contains: q } }, { description: { contains: q } }] } : {}),
  };
  const queries: Promise<any[]>[] = [];
  if (tab === 'mine' || tab === 'all') {
    queries.push(
      prisma.memoryProject.findMany({
        where: { ...base, workspace: { ownerId: user.id, kind: 'PRIVATE' } },
        include: projectListInclude,
        orderBy: { updatedAt: 'desc' },
      }),
    );
  }
  if (tab === 'public' || tab === 'all') {
    queries.push(
      prisma.memoryProject.findMany({
        where: { ...base, workspace: { kind: 'PUBLIC' } },
        include: projectListInclude,
        orderBy: { updatedAt: 'desc' },
      }),
    );
  }
  if (tab === 'shared' || tab === 'all') {
    queries.push(
      prisma.memoryProject.findMany({
        where: {
          ...base,
          permissions: { some: { userId: user.id } },
          workspace: { ownerId: { not: user.id }, kind: 'PRIVATE' },
        },
        include: projectListInclude,
        orderBy: { updatedAt: 'desc' },
      }),
    );
  }
  const rows = (await Promise.all(queries)).flat();
  const seen = new Set<string>();
  return rows
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .map((p) => {
      const access = computeProjectAccess(user, p);
      const { permissions: _perms, _count, ...rest } = p;
      return {
        ...rest,
        scope: p.workspace.kind === 'PUBLIC' ? 'public' : p.workspace.ownerId === user.id ? 'mine' : 'shared',
        itemCount: _count?.items ?? 0,
        access,
      };
    })
    .filter((p) => p.access.canRead);
}

export function parseTags(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function normalizeTags(tags: string[] | undefined) {
  if (!tags) return undefined;
  const clean = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean))).slice(0, 20);
  return JSON.stringify(clean);
}

export function serializeItem<T extends { tags: string }>(item: T) {
  return { ...item, tags: parseTags(item.tags) };
}

type MarkdownItem = {
  id: string;
  kind: string;
  title: string | null;
  content: string;
  tags: string;
  updatedAt: Date;
  pinned?: boolean;
};

/** 把项目和记忆条目渲染为 Markdown，供 MCP memory_get 和前端“复制全部记忆”使用。 */
export function renderProjectMarkdown(
  project: { id: string; name: string; description: string | null; workspace: { kind: string } },
  items: MarkdownItem[],
  opts: { includeIds?: boolean; heading?: string } = {},
) {
  const lines: string[] = [];
  lines.push(`# 项目记忆：${project.name}`);
  lines.push('');
  lines.push(`- 空间：${project.workspace.kind === 'PUBLIC' ? '公共（团队共享）' : '私人'}`);
  if (opts.includeIds) lines.push(`- projectId: ${project.id}`);
  if (project.description?.trim()) lines.push(`- 简介：${project.description.trim()}`);
  lines.push(`- 条目数：${items.length}`);
  lines.push('');
  if (items.length === 0) {
    lines.push('_（暂无记忆条目）_');
    return lines.join('\n');
  }
  for (const kind of MEMORY_KINDS) {
    const group = items.filter((i) => i.kind === kind);
    if (group.length === 0) continue;
    lines.push(`## ${MEMORY_KIND_LABELS[kind]}（${kind}）`);
    lines.push('');
    for (const item of group) {
      const tags = parseTags(item.tags);
      const head = item.title?.trim() ? `**${item.title.trim()}**：` : '';
      const meta: string[] = [];
      if (tags.length) meta.push(`标签: ${tags.join(', ')}`);
      if (opts.includeIds) meta.push(`id: ${item.id}`);
      meta.push(`更新: ${item.updatedAt.toISOString().slice(0, 10)}`);
      const body = item.content.trim().replace(/\n/g, '\n  ');
      lines.push(`- ${head}${body}`);
      lines.push(`  （${meta.join(' · ')}）`);
    }
    lines.push('');
  }
  const others = items.filter((i) => !(MEMORY_KINDS as readonly string[]).includes(i.kind));
  if (others.length) {
    lines.push('## 其他');
    for (const item of others) lines.push(`- ${item.title ? `**${item.title}**：` : ''}${item.content}`);
  }
  return lines.join('\n').trimEnd() + '\n';
}
