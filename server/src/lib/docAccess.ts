import { prisma } from '../prisma.js';
import { HttpError } from './asyncHandler.js';

export type DocRole = 'OWNER' | 'EDITOR' | 'VIEWER' | 'ADMIN';

export interface DocAccess {
  role: DocRole;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canInvite: boolean;
  isPublic: boolean;
}

export async function loadDoc(docId: string) {
  const doc = await prisma.document.findUnique({
    where: { id: docId, deletedAt: null },
    include: { workspace: true, permissions: true },
  });
  if (!doc) throw new HttpError(404, '文档不存在', 'DOC_NOT_FOUND');
  return doc;
}

/**
 * 加载文档（含已软删除的）。仅用于 admin 回收站管理。
 * 普通访问应使用 loadDoc，它会过滤掉软删除的文档。
 */
export async function loadDocIncludeDeleted(docId: string) {
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    include: { workspace: true, permissions: true },
  });
  if (!doc) throw new HttpError(404, '文档不存在', 'DOC_NOT_FOUND');
  return doc;
}

export function computeAccess(
  user: { id: string; role: string },
  doc: {
    createdById: string;
    workspace: { ownerId: string; kind: string };
    permissions: { userId: string; role: string }[];
  },
): DocAccess {
  const isAdmin = user.role === 'ADMIN';
  const isPublic = doc.workspace.kind === 'PUBLIC';
  const isCreator = doc.createdById === user.id;
  const isWorkspaceOwner = doc.workspace.ownerId === user.id;
  const perm = doc.permissions.find((p) => p.userId === user.id);

  if (isPublic) {
    if (isAdmin && !isCreator) {
      return {
        role: 'ADMIN',
        canRead: true,
        canWrite: true,
        canDelete: true,
        canInvite: true,
        isPublic,
      };
    }
    if (isCreator) {
      return {
        role: 'OWNER',
        canRead: true,
        canWrite: true,
        canDelete: true,
        canInvite: true,
        isPublic,
      };
    }
    if (perm?.role === 'EDITOR') {
      return {
        role: 'EDITOR',
        canRead: true,
        canWrite: true,
        canDelete: false,
        canInvite: false,
        isPublic,
      };
    }
    // 普通登录用户在公共空间默认可查看
    return {
      role: 'VIEWER',
      canRead: true,
      canWrite: false,
      canDelete: false,
      canInvite: false,
      isPublic,
    };
  }

  if (isCreator || isWorkspaceOwner) {
    return {
      role: 'OWNER',
      canRead: true,
      canWrite: true,
      canDelete: true,
      canInvite: true,
      isPublic,
    };
  }
  if (perm?.role === 'EDITOR') {
    return {
      role: 'EDITOR',
      canRead: true,
      canWrite: true,
      canDelete: false,
      canInvite: false,
      isPublic,
    };
  }
  if (perm?.role === 'VIEWER') {
    return {
      role: 'VIEWER',
      canRead: true,
      canWrite: false,
      canDelete: false,
      canInvite: false,
      isPublic,
    };
  }
  // 私人空间且非协作者：拒绝访问
  return {
    role: 'VIEWER',
    canRead: false,
    canWrite: false,
    canDelete: false,
    canInvite: false,
    isPublic,
  };
}

export async function loadDocWithAccess(
  user: { id: string; role: string },
  docId: string,
) {
  const doc = await loadDoc(docId);
  const access = computeAccess(user, doc);
  if (!access.canRead) throw new HttpError(403, '无权访问该文档', 'FORBIDDEN');
  return { doc, access };
}
