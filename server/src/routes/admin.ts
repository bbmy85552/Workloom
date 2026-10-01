import { Router } from 'express';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler, HttpError } from '../lib/asyncHandler.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { hashPassword, generateNumericCode } from '../lib/hash.js';
import { sendMail } from '../lib/mail.js';
import { getMailBrandName } from '../lib/systemSettings.js';
import { createBackupPayload, createMigrationPayload, restoreBackupPayload, restoreMigrationPayload } from '../lib/backup.js';
import { contentDispositionAttachment } from '../lib/filename.js';
import { env } from '../env.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

const execAsync = promisify(exec);

adminRouter.post(
  '/mail/test',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        to: z.string().email(),
        subject: z.string().trim().min(1).max(120).optional(),
        text: z.string().max(4000).optional(),
      })
      .parse(req.body);
    const brandName = await getMailBrandName();
    const subject = body.subject || `[${brandName}] 测试邮件`;
    const text =
      body.text ||
      '这是一封测试邮件，用于校验系统 SMTP 配置是否可用。\n\n如果你收到这封邮件，说明配置正确。';
    try {
      const result = await sendMail({ to: body.to, subject, text });
      res.json({ ok: true, transport: result.transport });
    } catch (err) {
      throw new HttpError(502, `发送失败：${(err as Error).message}`, 'MAIL_FAILED');
    }
  }),
);

adminRouter.get(
  '/users',
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        q: z.string().trim().optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query);
    const where = q.q
      ? {
          OR: [{ email: { contains: q.q } }, { name: { contains: q.q } }],
        }
      : {};
    const [total, list] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: q.pageSize,
        skip: (q.page - 1) * q.pageSize,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          avatarUrl: true,
          lastLoginAt: true,
          createdAt: true,
          emailVerifiedAt: true,
        },
      }),
    ]);
    res.json({ list, total, page: q.page, pageSize: q.pageSize });
  }),
);

adminRouter.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw new HttpError(404, '用户不存在', 'NOT_FOUND');
    const body = z
      .object({
        name: z.string().trim().min(1).max(40).optional(),
        role: z.enum(['USER', 'ADMIN']).optional(),
        status: z.enum(['ACTIVE', 'DISABLED']).optional(),
      })
      .parse(req.body);
    if (body.role && target.id === req.user!.id && body.role !== 'ADMIN') {
      throw new HttpError(400, '不能取消自己的管理员权限', 'SELF_DEMOTE');
    }
    if (body.status === 'DISABLED' && target.id === req.user!.id) {
      throw new HttpError(400, '不能禁用自己', 'SELF_DISABLE');
    }
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: body,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        lastLoginAt: true,
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'UPDATE_USER',
        target: target.id,
        metaJson: JSON.stringify(body),
      },
    });
    res.json({ user: updated });
  }),
);

adminRouter.post(
  '/users/:id/reset-password',
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw new HttpError(404, '用户不存在', 'NOT_FOUND');
    const newPassword = `Docs@${generateNumericCode(8)}`;
    await prisma.user.update({
      where: { id: target.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'RESET_PASSWORD',
        target: target.id,
        metaJson: '{}',
      },
    });
    res.json({ ok: true, password: newPassword });
  }),
);

adminRouter.post(
  '/users',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        email: z.string().email(),
        name: z.string().trim().min(1).max(40),
        password: z.string().min(8).max(64).optional(),
        role: z.enum(['USER', 'ADMIN']).default('USER'),
        status: z.enum(['ACTIVE', 'DISABLED']).default('ACTIVE'),
      })
      .parse(req.body);
    const email = body.email.toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) throw new HttpError(409, '该邮箱已注册', 'EMAIL_TAKEN');
    const password = body.password ?? `Docs@${generateNumericCode(8)}`;
    const user = await prisma.user.create({
      data: {
        email,
        name: body.name,
        passwordHash: await hashPassword(password),
        role: body.role,
        status: body.status,
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true, name: true, role: true, status: true, createdAt: true },
    });
    await prisma.workspace.create({
      data: { ownerId: user.id, name: '我的空间' },
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'CREATE_USER',
        target: user.id,
        metaJson: JSON.stringify({ email, role: body.role, status: body.status }),
      },
    });
    res.json({ user, initialPassword: password });
  }),
);

adminRouter.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw new HttpError(404, '用户不存在', 'NOT_FOUND');
    if (target.id === req.user!.id) throw new HttpError(400, '不能删除自己', 'SELF_DELETE');
    await prisma.user.delete({ where: { id: target.id } });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'DELETE_USER',
        target: target.id,
        metaJson: JSON.stringify({ email: target.email }),
      },
    });
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/groups',
  asyncHandler(async (_req, res) => {
    const list = await prisma.userGroup.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        members: {
          include: {
            user: { select: { id: true, email: true, name: true, avatarUrl: true } },
          },
        },
      },
    });
    res.json({ list });
  }),
);

adminRouter.post(
  '/groups',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(40),
        description: z.string().trim().max(200).optional(),
      })
      .parse(req.body);
    const group = await prisma.userGroup.create({
      data: { name: body.name, description: body.description ?? null },
    });
    res.json({ group });
  }),
);

adminRouter.patch(
  '/groups/:id',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(40).optional(),
        description: z.string().trim().max(200).nullable().optional(),
      })
      .parse(req.body);
    const group = await prisma.userGroup.update({
      where: { id: req.params.id },
      data: body,
    });
    res.json({ group });
  }),
);

adminRouter.delete(
  '/groups/:id',
  asyncHandler(async (req, res) => {
    await prisma.userGroup.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/groups/:id/members',
  asyncHandler(async (req, res) => {
    const body = z.object({ userId: z.string() }).parse(req.body);
    const exists = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!exists) throw new HttpError(404, '用户不存在', 'NOT_FOUND');
    const member = await prisma.userGroupMember.upsert({
      where: { groupId_userId: { groupId: req.params.id, userId: body.userId } },
      update: {},
      create: { groupId: req.params.id, userId: body.userId },
      include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } },
    });
    res.json({ member });
  }),
);

adminRouter.delete(
  '/groups/:id/members/:userId',
  asyncHandler(async (req, res) => {
    await prisma.userGroupMember.delete({
      where: { groupId_userId: { groupId: req.params.id, userId: req.params.userId } },
    });
    res.json({ ok: true });
  }),
);

const DEFAULT_SETTINGS: Record<string, string> = {
  allow_public_register: 'true',
  default_workspace_name: '我的空间',
  max_upload_mb: '25',
  brand_name: '文档中心',
  company_name: '文档中心',
  oa_url: 'https://2dqy-oa.2dqy.com/calendar',
  register_invite_code: '',
  latest_version: '',
};

function currentVersion() {
  return env.APP_VERSION || '0.1.0';
}

function normalizeVersion(v: string) {
  return v.trim().replace(/^v/i, '');
}

function isNewerVersion(latest: string, current: string) {
  const l = normalizeVersion(latest);
  const c = normalizeVersion(current);
  if (!l || l === c) return false;
  const lp = l.split('.').map((x) => Number.parseInt(x, 10));
  const cp = c.split('.').map((x) => Number.parseInt(x, 10));
  if (lp.some((x) => Number.isNaN(x)) || cp.some((x) => Number.isNaN(x))) return l !== c;
  const len = Math.max(lp.length, cp.length);
  for (let i = 0; i < len; i += 1) {
    const a = lp[i] ?? 0;
    const b = cp[i] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

function versionFromPayload(payload: unknown) {
  if (typeof payload === 'string') return payload.trim();
  if (!payload || typeof payload !== 'object') return '';
  const p = payload as Record<string, unknown>;
  for (const key of ['version', 'latestVersion', 'tag_name', 'name']) {
    const value = p[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function commitFromPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') return '';
  const p = payload as Record<string, unknown>;
  const direct = p.sha;
  if (typeof direct === 'string' && /^[0-9a-f]{7,40}$/i.test(direct)) return direct;
  const object = p.object;
  if (object && typeof object === 'object') {
    const objectSha = (object as Record<string, unknown>).sha;
    if (typeof objectSha === 'string' && /^[0-9a-f]{7,40}$/i.test(objectSha)) return objectSha;
  }
  return '';
}

async function fetchLatestUpdateInfo() {
  if (!env.JIANJI_UPDATE_CHECK_URL || env.NODE_ENV === 'test') {
    return { version: '', commit: '', source: 'disabled' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(env.JIANJI_UPDATE_CHECK_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json, text/plain' },
    });
    if (!response.ok) return { version: '', commit: '', source: 'unavailable' };
    const type = response.headers.get('content-type') ?? '';
    if (type.includes('application/json')) {
      const payload = await response.json();
      return {
        version: versionFromPayload(payload),
        commit: commitFromPayload(payload),
        source: env.JIANJI_UPDATE_CHECK_URL,
      };
    }
    return {
      version: versionFromPayload(await response.text()),
      commit: '',
      source: env.JIANJI_UPDATE_CHECK_URL,
    };
  } catch (err) {
    console.warn('[简记] 版本检测失败：', (err as Error).message);
    return { version: '', commit: '', source: 'failed' };
  } finally {
    clearTimeout(timer);
  }
}

async function broadcastMaintenanceNotification(input: {
  title: string;
  body: string;
  actorId: string;
}) {
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, email: true },
  });
  if (users.length === 0) return { users: 0, emails: 0, emailErrors: 0 };
  await prisma.notification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      category: 'maintenance',
      title: input.title,
      body: input.body,
      link: '/app/dashboard',
      metaJson: JSON.stringify({ actorId: input.actorId }),
    })),
  });
  let emails = 0;
  let emailErrors = 0;
  const brandName = await getMailBrandName();
  for (const u of users) {
    try {
      await sendMail({
        to: u.email,
        subject: `[${brandName}] ${input.title}`,
        text: `${input.body}\n\n此邮件由${brandName}系统维护通知自动发送。`,
      });
      emails += 1;
    } catch (err) {
      emailErrors += 1;
      console.warn('[简记] 维护通知邮件发送失败：', u.email, (err as Error).message);
    }
  }
  return { users: users.length, emails, emailErrors };
}

adminRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.systemSetting.findMany();
    const map: Record<string, string> = { ...DEFAULT_SETTINGS };
    for (const r of rows) map[r.key] = r.value;
    res.json({ settings: map });
  }),
);

adminRouter.put(
  '/settings',
  asyncHandler(async (req, res) => {
    const body = z.record(z.string().max(500)).parse(req.body ?? {});
    const allowedKeys = Object.keys(DEFAULT_SETTINGS);
    const entries = Object.entries(body).filter(([k]) => allowedKeys.includes(k));
    await Promise.all(
      entries.map(([key, value]) =>
        prisma.systemSetting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        }),
      ),
    );
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'UPDATE_SETTINGS',
        target: 'system',
        metaJson: JSON.stringify(
          Object.fromEntries(
            entries.map(([key, value]) => [
              key,
              key === 'register_invite_code' && value ? '[REDACTED]' : value,
            ]),
          ),
        ),
      },
    });
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const [userCount, docCount, tableCount, attachmentCount] = await Promise.all([
      prisma.user.count(),
      prisma.document.count(),
      prisma.tableBase.count(),
      prisma.attachment.count(),
    ]);
    const totalSize = await prisma.attachment.aggregate({ _sum: { size: true } });
    res.json({
      userCount,
      docCount,
      tableCount,
      attachmentCount,
      attachmentTotalSize: totalSize._sum.size ?? 0,
    });
  }),
);

adminRouter.get(
  '/backup',
  asyncHandler(async (_req, res) => {
    const payload = await createBackupPayload();
    const stamp = payload.exportedAt.slice(0, 19).replace(/[:T]/g, '-');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', contentDispositionAttachment(`jianji-backup-${stamp}.json`));
    res.json(payload);
  }),
);

adminRouter.get(
  '/migration',
  asyncHandler(async (_req, res) => {
    const payload = await createMigrationPayload();
    const stamp = payload.exportedAt.slice(0, 19).replace(/[:T]/g, '-');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', contentDispositionAttachment(`jianji-migration-${stamp}.json`));
    res.json(payload);
  }),
);

adminRouter.post(
  '/backup/restore',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        confirm: z.literal('RESTORE'),
        backup: z.object({
          app: z.literal('jianji').optional(),
          version: z.number().optional(),
          data: z.record(z.unknown()),
        }),
      })
      .parse(req.body);
    const counts = await restoreBackupPayload(body.backup);
    res.json({ ok: true, counts });
  }),
);

adminRouter.post(
  '/migration/restore',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        confirm: z.literal('RESTORE'),
        backup: z.object({
          app: z.literal('jianji').optional(),
          version: z.number().optional(),
          data: z.record(z.unknown()),
          files: z.array(z.unknown()).optional(),
        }),
      })
      .parse(req.body);
    const result = await restoreMigrationPayload(body.backup);
    res.json({ ok: true, ...result });
  }),
);

adminRouter.get(
  '/update/status',
  asyncHandler(async (_req, res) => {
    const latestRow = await prisma.systemSetting.findUnique({ where: { key: 'latest_version' } });
    const current = currentVersion();
    const latestInfo = await fetchLatestUpdateInfo();
    const latest = (latestRow?.value || env.JIANJI_LATEST_VERSION || latestInfo.version || current).trim();
    const currentCommit = env.JIANJI_CURRENT_COMMIT.trim();
    const latestCommit = latestInfo.commit.trim();
    const commitUpdate = Boolean(currentCommit && latestCommit && currentCommit !== latestCommit);
    const versionUpdate = isNewerVersion(latest, current);
    res.json({
      currentVersion: current,
      latestVersion: latest || current,
      currentCommit,
      latestCommit,
      updateSource: latestInfo.source,
      updateRepo: env.JIANJI_UPDATE_REPO,
      updateBranch: env.JIANJI_UPDATE_BRANCH,
      hasUpdate: commitUpdate || versionUpdate,
      autoUpdateConfigured: Boolean(env.JIANJI_UPDATE_COMMAND),
      manualCommand: 'bash scripts/update.sh',
      checkUrl: env.NODE_ENV === 'test' ? '' : env.JIANJI_UPDATE_CHECK_URL,
    });
  }),
);

adminRouter.post(
  '/update/start',
  asyncHandler(async (req, res) => {
    const body = z.object({ latestVersion: z.string().trim().max(40).optional() }).parse(req.body ?? {});
    const latest = body.latestVersion || env.JIANJI_LATEST_VERSION || currentVersion();
    const started = await broadcastMaintenanceNotification({
      actorId: req.user!.id,
      title: '文档中心正在更新',
      body: '文档中心正在更新，请在此期间暂时不要使用。更新完成后我们会再次通知你，感谢你的理解与支持。',
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'START_UPDATE',
        target: latest,
        metaJson: JSON.stringify({ autoUpdateConfigured: Boolean(env.JIANJI_UPDATE_COMMAND), started }),
      },
    });
    if (!env.JIANJI_UPDATE_COMMAND) {
      res.json({
        ok: true,
        mode: 'manual',
        notified: started,
        message: '未配置自动更新命令。请在服务器执行 bash scripts/update.sh，完成后点击“发送完成通知”。',
      });
      return;
    }
    try {
      const result = await execAsync(env.JIANJI_UPDATE_COMMAND, {
        timeout: 30 * 60 * 1000,
        maxBuffer: 2 * 1024 * 1024,
      });
      const finished = await broadcastMaintenanceNotification({
        actorId: req.user!.id,
        title: '文档中心已更新完毕',
        body: '感谢您的支持与理解，文档中心已更新完毕，可以继续使用。',
      });
      await prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          action: 'FINISH_UPDATE',
          target: latest,
          metaJson: JSON.stringify({
            stdout: result.stdout.slice(-4000),
            stderr: result.stderr.slice(-4000),
            finished,
          }),
        },
      });
      res.json({ ok: true, mode: 'auto', notified: { started, finished } });
    } catch (err) {
      await broadcastMaintenanceNotification({
        actorId: req.user!.id,
        title: '文档中心更新未完成',
        body: '文档中心更新过程中遇到问题，管理员正在处理。请暂时不要进行关键编辑操作。',
      });
      throw new HttpError(502, `更新命令执行失败：${(err as Error).message}`, 'UPDATE_FAILED');
    }
  }),
);

adminRouter.post(
  '/update/finish',
  asyncHandler(async (req, res) => {
    const finished = await broadcastMaintenanceNotification({
      actorId: req.user!.id,
      title: '文档中心已更新完毕',
      body: '感谢您的支持与理解，文档中心已更新完毕，可以继续使用。',
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'FINISH_UPDATE_MANUAL',
        target: 'system',
        metaJson: JSON.stringify({ finished }),
      },
    });
    res.json({ ok: true, notified: finished });
  }),
);

adminRouter.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query);
    const [total, list] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { actor: { select: { id: true, email: true, name: true } } },
      }),
    ]);
    res.json({ list, total, page: q.page, pageSize: q.pageSize });
  }),
);

// ----- 回收站：公共知识库文档软删除恢复与彻底清理 -----

const TRASH_RETAIN_DAYS = 30;

adminRouter.get(
  '/trash',
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query);
    // 惰性清理：超过保留期的软删除文档彻底删除
    const expireBefore = new Date(Date.now() - TRASH_RETAIN_DAYS * 24 * 60 * 60 * 1000);
    await prisma.document.deleteMany({ where: { deletedAt: { lt: expireBefore } } });

    const [total, list] = await Promise.all([
      prisma.document.count({ where: { deletedAt: { not: null } } }),
      prisma.document.findMany({
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          title: true,
          workspaceId: true,
          parentId: true,
          deletedAt: true,
          workspace: { select: { id: true, name: true, kind: true } },
          deletedBy: { select: { id: true, email: true, name: true } },
          createdBy: { select: { id: true, email: true, name: true } },
        },
      }),
    ]);
    const items = list.map((d) => ({
      ...d,
      remainDays: d.deletedAt
        ? Math.max(
            0,
            Math.ceil(
              (d.deletedAt.getTime() + TRASH_RETAIN_DAYS * 24 * 60 * 60 * 1000 - Date.now()) /
                (24 * 60 * 60 * 1000),
            ),
          )
        : 0,
    }));
    res.json({ list: items, total, page: q.page, pageSize: q.pageSize });
  }),
);

adminRouter.post(
  '/trash/:id/restore',
  asyncHandler(async (req, res) => {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      select: { id: true, title: true, parentId: true, deletedAt: true },
    });
    if (!doc || !doc.deletedAt) throw new HttpError(404, '回收站中无此文档', 'NOT_FOUND');

    // 恢复整条父链：若父文件夹也被软删，一并恢复，避免恢复后变成孤儿
    let cursor = doc.parentId;
    const parentChain: string[] = [];
    const visited = new Set<string>();
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor);
      const parent = await prisma.document.findUnique({
        where: { id: cursor },
        select: { id: true, parentId: true, deletedAt: true },
      });
      if (!parent) break;
      if (parent.deletedAt) parentChain.push(parent.id);
      cursor = parent.parentId;
    }
    if (parentChain.length) {
      await prisma.document.updateMany({
        where: { id: { in: parentChain } },
        data: { deletedAt: null, deletedById: null },
      });
    }
    const restored = await prisma.document.update({
      where: { id: doc.id },
      data: { deletedAt: null, deletedById: null },
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'RESTORE_DOC',
        target: doc.id,
        metaJson: JSON.stringify({ title: doc.title }),
      },
    });
    res.json({ doc: restored, restoredParents: parentChain.length });
  }),
);

adminRouter.delete(
  '/trash/:id',
  asyncHandler(async (req, res) => {
    const doc = await prisma.document.findUnique({
      where: { id: req.params.id },
      select: { id: true, title: true, deletedAt: true },
    });
    if (!doc || !doc.deletedAt) throw new HttpError(404, '回收站中无此文档', 'NOT_FOUND');
    await prisma.document.delete({ where: { id: doc.id } });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'PURGE_DOC',
        target: doc.id,
        metaJson: JSON.stringify({ title: doc.title }),
      },
    });
    res.json({ ok: true });
  }),
);
