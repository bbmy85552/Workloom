import type { UserSearchItem } from '../../lib/types';

export type MemoryKind = 'fact' | 'decision' | 'preference' | 'note' | 'todo';
export type MemoryScope = 'mine' | 'public' | 'shared';

export const MEMORY_KIND_OPTIONS: { v: MemoryKind; label: string; cls: string }[] = [
  { v: 'fact', label: '事实', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  { v: 'decision', label: '决策', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  { v: 'preference', label: '偏好', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  { v: 'note', label: '笔记', cls: 'bg-slate-50 text-slate-700 border-slate-200' },
  { v: 'todo', label: '待办', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
];

export function kindMeta(kind: string) {
  return MEMORY_KIND_OPTIONS.find((k) => k.v === kind) ?? MEMORY_KIND_OPTIONS[3];
}

export interface MemoryAccess {
  role: 'OWNER' | 'EDITOR' | 'VIEWER' | 'ADMIN';
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canInvite: boolean;
  isPublic: boolean;
}

export interface MemoryProject {
  id: string;
  name: string;
  description: string | null;
  workspaceId: string;
  workspace: { id: string; name: string; kind: 'PRIVATE' | 'PUBLIC'; ownerId: string };
  createdById: string;
  createdBy?: UserSearchItem | null;
  createdAt: string;
  updatedAt: string;
  scope?: MemoryScope;
  itemCount?: number;
  access?: MemoryAccess;
}

export interface MemoryItem {
  id: string;
  projectId: string;
  kind: MemoryKind;
  title: string | null;
  content: string;
  pinned: boolean;
  tags: string[];
  source: string | null;
  createdById: string;
  createdBy?: UserSearchItem | null;
  updatedBy?: UserSearchItem | null;
  createdAt: string;
  updatedAt: string;
}

export const MEMORY_MCP_URL = 'https://company.2dqy.com/mcp/memory';

export const ROLE_LABEL: Record<MemoryAccess['role'], string> = {
  OWNER: '所有者',
  ADMIN: '管理员',
  EDITOR: '可编辑',
  VIEWER: '只读',
};
