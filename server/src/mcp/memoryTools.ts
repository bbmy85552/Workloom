import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AuthedUser } from '../middleware/auth.js';
import { HttpError } from '../lib/asyncHandler.js';
import {
  MEMORY_KINDS,
  listProjects,
  loadProjectWithAccess,
  renderProjectMarkdown,
} from '../lib/memoryAccess.js';
import {
  createItem,
  createProject,
  listItems,
  searchItems,
  softDeleteItem,
  updateItem,
} from '../lib/memoryService.js';

export const MEMORY_MCP_INSTRUCTIONS = [
  'jianji 项目记忆（Project Memory）：团队与个人的项目事实、决策、偏好、笔记和待办。',
  '开始一个项目相关的任务前：先调用 memory_projects_list 找到项目，再调用 memory_get 读取全部置顶记忆，并在后续工作中遵循这些记忆。',
  '工作中产生了值得长期保留的信息（确定的事实、做出的决策、用户偏好）时，用 memory_add 写入；信息过时则用 memory_update 修改或 memory_delete 删除。',
  '不要写入密码、密钥、token 等敏感信息。',
].join('\n');

const KindSchema = z.enum(MEMORY_KINDS);
const KIND_HELP = 'fact=事实, decision=决策, preference=偏好, note=笔记, todo=待办';

function text(data: string) {
  return { content: [{ type: 'text' as const, text: data }] };
}

function json(data: unknown) {
  return text(JSON.stringify(data, null, 2));
}

/** 支持用 projectId 或项目名称定位项目（名称需唯一匹配，忽略大小写）。 */
async function resolveProjectId(user: AuthedUser, projectId?: string, projectName?: string) {
  if (projectId) return projectId;
  const name = projectName?.trim();
  if (!name) throw new HttpError(400, '需要 projectId 或 projectName', 'INVALID');
  const all = await listProjects(user, 'all');
  const exact = all.filter((p) => p.name.toLowerCase() === name.toLowerCase());
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) {
    throw new HttpError(
      409,
      `有多个同名项目，请改用 projectId：${exact.map((p) => `${p.id}(${p.scope})`).join(', ')}`,
      'AMBIGUOUS',
    );
  }
  throw new HttpError(404, `找不到名为「${name}」的项目，可先调用 memory_projects_list`, 'PROJECT_NOT_FOUND');
}

const projectRef = {
  projectId: z.string().optional().describe('项目 id（来自 memory_projects_list）'),
  projectName: z.string().max(80).optional().describe('也可以直接传项目名称（需唯一）'),
};

export function registerMemoryTools(server: McpServer, user: AuthedUser) {
  server.registerTool(
    'memory_projects_list',
    {
      title: 'List Memory Projects',
      description:
        'List project-memory spaces the user can access (private, public team-shared, and shared-with-me). Call this first to find the projectId, then call memory_get.',
      inputSchema: {
        scope: z.enum(['mine', 'public', 'shared', 'all']).default('all'),
        q: z.string().max(120).optional().describe('按名称/简介搜索'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ scope, q }) => {
      const list = await listProjects(user, scope, q || undefined);
      return json({
        projects: list.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          scope: p.scope,
          itemCount: p.itemCount,
          canWrite: p.access.canWrite,
          role: p.access.role,
          createdBy: p.createdBy?.name,
          updatedAt: p.updatedAt,
        })),
      });
    },
  );

  server.registerTool(
    'memory_project_create',
    {
      title: 'Create Memory Project',
      description:
        'Create a project-memory space. visibility "private" = only you (and collaborators you invite); "public" = visible to every logged-in team member.',
      inputSchema: {
        name: z.string().min(1).max(80),
        description: z.string().max(2000).optional(),
        visibility: z.enum(['private', 'public']).default('private'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ name, description, visibility }) => {
      const project = await createProject(user, {
        name: name.trim(),
        description: description?.trim() || null,
        workspaceKind: visibility === 'public' ? 'PUBLIC' : 'PRIVATE',
      });
      return json({ project: { id: project.id, name: project.name, scope: visibility } });
    },
  );

  server.registerTool(
    'memory_get',
    {
      title: 'Get Project Memory',
      description:
        'IMPORTANT: call this at the start of any work on a project. Returns the project info and ALL pinned memory items (facts, decisions, preferences, notes, todos) as Markdown, including item ids for later memory_update/memory_delete. Follow these memories while working.',
      inputSchema: {
        ...projectRef,
        includeUnpinned: z.boolean().default(false).describe('同时返回未置顶条目'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ projectId, projectName, includeUnpinned }) => {
      const id = await resolveProjectId(user, projectId, projectName);
      const { project, access } = await loadProjectWithAccess(user, id);
      const items = await listItems(project.id, { pinnedOnly: !includeUnpinned });
      const md = renderProjectMarkdown(project, items, { includeIds: true });
      const footer = `\n---\n你的权限：${access.role}${access.canWrite ? '（可写，可用 memory_add / memory_update / memory_delete）' : '（只读）'}\n`;
      return text(md + footer);
    },
  );

  server.registerTool(
    'memory_add',
    {
      title: 'Add Memory Item',
      description: `Add a memory item to a project. kind: ${KIND_HELP}. Keep each item short and self-contained (one fact/decision per item). Never store secrets.`,
      inputSchema: {
        ...projectRef,
        kind: KindSchema.default('note'),
        content: z.string().min(1).max(20_000),
        title: z.string().max(200).optional(),
        tags: z.array(z.string().max(40)).max(20).optional(),
        pinned: z.boolean().default(true).describe('置顶条目会被 memory_get 默认返回'),
        source: z.string().max(80).optional().describe('来源客户端，例如 claude / chatgpt / cursor'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ projectId, projectName, kind, content, title, tags, pinned, source }) => {
      const id = await resolveProjectId(user, projectId, projectName);
      const item = await createItem(user, id, {
        kind,
        content: content.trim(),
        title: title ?? null,
        tags,
        pinned,
        source: source || 'mcp',
      });
      return json({ item: { id: item.id, kind: item.kind, title: item.title, pinned: item.pinned } });
    },
  );

  server.registerTool(
    'memory_update',
    {
      title: 'Update Memory Item',
      description: `Update a memory item (only the fields you pass are changed). kind: ${KIND_HELP}.`,
      inputSchema: {
        ...projectRef,
        itemId: z.string(),
        kind: KindSchema.optional(),
        content: z.string().min(1).max(20_000).optional(),
        title: z.string().max(200).nullable().optional(),
        tags: z.array(z.string().max(40)).max(20).optional(),
        pinned: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ projectId, projectName, itemId, ...rest }) => {
      const id = await resolveProjectId(user, projectId, projectName);
      const item = await updateItem(user, id, itemId, {
        ...rest,
        content: rest.content?.trim(),
      });
      return json({ item: { id: item.id, kind: item.kind, title: item.title, pinned: item.pinned, updatedAt: item.updatedAt } });
    },
  );

  server.registerTool(
    'memory_delete',
    {
      title: 'Delete Memory Item',
      description: 'Delete (soft-delete) an outdated or wrong memory item from a project.',
      inputSchema: { ...projectRef, itemId: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ projectId, projectName, itemId }) => {
      const id = await resolveProjectId(user, projectId, projectName);
      return json(await softDeleteItem(user, id, itemId));
    },
  );

  server.registerTool(
    'memory_search',
    {
      title: 'Search Memory',
      description:
        'Keyword search (substring match on title/content/tags) across all accessible project memories, or within one project.',
      inputSchema: {
        q: z.string().min(1).max(200),
        ...projectRef,
        kind: KindSchema.optional(),
        limit: z.number().int().min(1).max(200).default(50),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ q, projectId, projectName, kind, limit }) => {
      const accessible = await listProjects(user, 'all');
      const pid = projectId || projectName ? await resolveProjectId(user, projectId, projectName) : undefined;
      const items = await searchItems(
        user,
        { q: q.trim(), projectId: pid, kind, limit },
        accessible.map((p) => p.id),
      );
      return json({
        items: items.map((i) => ({
          id: i.id,
          project: i.project,
          kind: i.kind,
          title: i.title,
          content: i.content,
          tags: i.tags,
          pinned: i.pinned,
          updatedAt: i.updatedAt,
        })),
      });
    },
  );
}

/** 仅包含项目记忆工具的 MCP Server，用于 /mcp/memory。 */
export function createMemoryMcpServer(user: AuthedUser) {
  const server = new McpServer(
    { name: 'jianji-memory', version: '0.1.0' },
    { instructions: MEMORY_MCP_INSTRUCTIONS },
  );
  registerMemoryTools(server, user);
  return server;
}
