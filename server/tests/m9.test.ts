import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { getApp, loginAdmin, registerUser, resetData } from './helpers.js';
import { prisma } from '../src/prisma.js';
import { contentDispositionAttachment, normalizeFilename } from '../src/lib/filename.js';
import { UPLOAD_ROOT } from '../src/lib/upload.js';

describe('M9 - 评论 / 重复日程 / 备份 / 邮件文件夹', () => {
  beforeEach(async () => {
    await resetData();
  });

  it('文档评论支持锚点、回复与解决', async () => {
    const app = await getApp();
    const { cookie } = await registerUser('comment@m9.local', 'Commenter');
    const doc = await request(app).post('/api/docs').set('Cookie', cookie).send({ title: '评论文档' });

    const created = await request(app)
      .post(`/api/docs/${doc.body.doc.id}/comments`)
      .set('Cookie', cookie)
      .send({ body: '这里需要补充说明', anchorText: '第一段' });
    expect(created.status).toBe(200);
    expect(created.body.comment.anchorText).toBe('第一段');

    const reply = await request(app)
      .post(`/api/docs/${doc.body.doc.id}/comments`)
      .set('Cookie', cookie)
      .send({ body: '已补充', parentId: created.body.comment.id });
    expect(reply.status).toBe(200);

    const resolved = await request(app)
      .patch(`/api/docs/${doc.body.doc.id}/comments/${created.body.comment.id}`)
      .set('Cookie', cookie)
      .send({ resolved: true });
    expect(resolved.status).toBe(200);
    expect(resolved.body.comment.resolvedAt).toBeTruthy();

    const list = await request(app).get(`/api/docs/${doc.body.doc.id}/comments`).set('Cookie', cookie);
    expect(list.body.list).toHaveLength(2);
  });

  it('重复日程会按查询范围展开', async () => {
    const app = await getApp();
    const { cookie } = await registerUser('repeat@m9.local', 'RepeatUser');
    const start = new Date(Date.UTC(2026, 0, 1, 9, 0, 0));
    const end = new Date(Date.UTC(2026, 0, 1, 10, 0, 0));
    const created = await request(app)
      .post('/api/calendar')
      .set('Cookie', cookie)
      .send({
        title: '每日站会',
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        repeatRule: 'daily',
      });
    expect(created.status).toBe(200);

    const from = new Date(Date.UTC(2026, 0, 3, 0, 0, 0));
    const to = new Date(Date.UTC(2026, 0, 3, 23, 59, 59));
    const list = await request(app)
      .get('/api/calendar')
      .query({ from: from.toISOString(), to: to.toISOString() })
      .set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(list.body.list).toHaveLength(1);
    expect(list.body.list[0].sourceEventId).toBe(created.body.event.id);
    expect(list.body.list[0].isOccurrence).toBe(true);
    expect(list.body.list[0].startAt).toContain('2026-01-03');
  });

  it('待办可以排入日历并关联原待办', async () => {
    const app = await getApp();
    const { cookie } = await registerUser('schedule@m9.local', 'ScheduleUser');
    const todo = await request(app)
      .post('/api/todos')
      .set('Cookie', cookie)
      .send({ title: '写周报' });
    const start = new Date(Date.UTC(2026, 4, 25, 9, 0, 0));
    const end = new Date(Date.UTC(2026, 4, 25, 10, 0, 0));
    const scheduled = await request(app)
      .post(`/api/todos/${todo.body.todo.id}/schedule`)
      .set('Cookie', cookie)
      .send({ startAt: start.toISOString(), endAt: end.toISOString() });
    expect(scheduled.status).toBe(200);
    expect(scheduled.body.event.relatedTodoId).toBe(todo.body.todo.id);
    expect(scheduled.body.todo.dueDate).toBe(start.toISOString());
  });

  it('邮件文件夹可列出缓存文件夹并移动邮件', async () => {
    const app = await getApp();
    const { cookie } = await registerUser('folder@m9.local', 'FolderUser');
    const account = await request(app)
      .post('/api/mail/quick-bind')
      .set('Cookie', cookie)
      .send({ email: 'folder@163.com', password: 'token', skipTest: true });
    const message = await prisma.mailMessage.create({
      data: {
        accountId: account.body.account.id,
        folder: 'INBOX',
        uid: 99,
        subject: '需要归档',
        receivedAt: new Date(),
      },
    });

    const folders1 = await request(app)
      .get(`/api/mail/accounts/${account.body.account.id}/folders`)
      .set('Cookie', cookie);
    expect(folders1.body.list).toContain('INBOX');

    const moved = await request(app)
      .patch(`/api/mail/messages/${message.id}`)
      .set('Cookie', cookie)
      .send({ folder: 'Archive' });
    expect(moved.status).toBe(200);
    expect(moved.body.message.folder).toBe('Archive');

    const archive = await request(app)
      .get(`/api/mail/accounts/${account.body.account.id}/messages`)
      .query({ folder: 'Archive' })
      .set('Cookie', cookie);
    expect(archive.body.list[0].id).toBe(message.id);
  });

  it.each(['workloom', 'jianji'])('管理员可以导出新备份并恢复 %s JSON 备份', async (appName) => {
    const app = await getApp();
    const { cookie } = await loginAdmin();
    await request(app)
      .put('/api/admin/settings')
      .set('Cookie', cookie)
      .send({ brand_name: '备份前' });

    const backup = await request(app).get('/api/admin/backup').set('Cookie', cookie);
    expect(backup.status).toBe(200);
    expect(backup.body.app).toBe('workloom');
    expect(backup.headers['content-disposition']).toContain('workloom-backup-');
    expect(backup.body.counts.users).toBeGreaterThan(0);

    await request(app)
      .put('/api/admin/settings')
      .set('Cookie', cookie)
      .send({ brand_name: '备份后' });
    const restored = await request(app)
      .post('/api/admin/backup/restore')
      .set('Cookie', cookie)
      .send({ confirm: 'RESTORE', backup: { ...backup.body, app: appName } });
    expect(restored.status).toBe(200);

    const settings = await request(app).get('/api/admin/settings').set('Cookie', cookie);
    expect(settings.status).toBe(200);
    expect(settings.body.settings.brand_name).toBe('备份前');
  });

  it.each(['workloom', 'jianji'])('管理员可以导出新迁移包并恢复 %s 完整迁移包', async (appName) => {
    const app = await getApp();
    const { cookie } = await loginAdmin();
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@test.local' } });
    const rel = 'attachments/test-migration/workloom-note.txt';
    const abs = path.join(UPLOAD_ROOT, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, 'hello migration', 'utf8');
    await prisma.attachment.create({
      data: {
        ownerId: admin.id,
        originalName: '迁移说明.txt',
        storedName: rel,
        mimeType: 'text/plain',
        size: 'hello migration'.length,
      },
    });

    const exported = await request(app).get('/api/admin/migration').set('Cookie', cookie);
    expect(exported.status).toBe(200);
    expect(exported.body.app).toBe('workloom');
    expect(exported.headers['content-disposition']).toContain('workloom-migration-');
    expect(exported.body.version).toBe(2);
    expect(exported.body.files.some((f: any) => f.path === rel)).toBe(true);
    expect(exported.body.config.note).toContain('不包含 JWT_SECRET');

    await fs.unlink(abs);
    const restored = await request(app)
      .post('/api/admin/migration/restore')
      .set('Cookie', cookie)
      .send({ confirm: 'RESTORE', backup: { ...exported.body, app: appName } });
    expect(restored.status).toBe(200);
    expect(restored.body.restoredFiles).toBeGreaterThan(0);
    await expect(fs.readFile(abs, 'utf8')).resolves.toBe('hello migration');
  });

  it('附件读取不会允许穿越上传目录', async () => {
    const app = await getApp();
    const { cookie } = await loginAdmin();
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@test.local' } });
    const outside = path.resolve(UPLOAD_ROOT, '../uploads_evil/secret.txt');
    await fs.mkdir(path.dirname(outside), { recursive: true });
    await fs.writeFile(outside, 'outside secret', 'utf8');
    const att = await prisma.attachment.create({
      data: {
        ownerId: admin.id,
        originalName: 'secret.txt',
        storedName: '../uploads_evil/secret.txt',
        mimeType: 'text/plain',
        size: 'outside secret'.length,
      },
    });

    const raw = await request(app).get(`/api/attachments/${att.id}/raw`).set('Cookie', cookie);
    expect(raw.status).toBe(404);
    await fs.rm(path.dirname(outside), { recursive: true, force: true });
  });

  it('附件下载会兼容旧运行目录中的上传文件', async () => {
    const app = await getApp();
    const { cookie } = await loginAdmin();
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@test.local' } });
    const rel = 'attachments/legacy-download/old-note.txt';
    const legacyRoot = path.resolve(UPLOAD_ROOT, '..', 'dist', 'uploads');
    const legacyAbs = path.join(legacyRoot, rel);
    const primaryAbs = path.join(UPLOAD_ROOT, rel);
    await fs.rm(primaryAbs, { force: true });
    await fs.mkdir(path.dirname(legacyAbs), { recursive: true });
    await fs.writeFile(legacyAbs, 'legacy attachment', 'utf8');
    const att = await prisma.attachment.create({
      data: {
        ownerId: admin.id,
        originalName: '旧附件.txt',
        storedName: rel,
        mimeType: 'text/plain',
        size: 'legacy attachment'.length,
      },
    });

    const raw = await request(app).get(`/api/attachments/${att.id}/raw?download=1`).set('Cookie', cookie);
    expect(raw.status).toBe(200);
    expect(raw.text).toBe('legacy attachment');
    expect(raw.headers['content-disposition']).toContain(encodeURIComponent('旧附件.txt'));
    await fs.rm(path.dirname(legacyAbs), { recursive: true, force: true });
  });

  it('文件名乱码会被恢复为中文并写入 UTF-8 下载响应头', () => {
    const broken = 'å´éæ±-å­èä¿¡æ¯ç³»ç»peopleæ¹å.pdf';
    const fixed = '吴镜昱-字节信息系统people方向.pdf';
    expect(normalizeFilename(broken)).toBe(fixed);
    expect(contentDispositionAttachment(broken)).toContain(encodeURIComponent(fixed));
  });
});
