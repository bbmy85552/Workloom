import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/prisma.js';
import { storeUploadBuffer } from '../src/lib/upload.js';
import { getApp, registerUser, resetData } from './helpers.js';

beforeAll(async () => {
  await getApp();
});

afterEach(async () => {
  await resetData();
});

describe('文档 CRUD 与权限', () => {
  it('创建/读取/更新/删除自己的文档', async () => {
    const app = await getApp();
    const { cookie } = await registerUser('docuser@test.local', 'DocUser');
    const wsList = await request(app).get('/api/workspaces').set('Cookie', cookie);
    const ws = wsList.body.list[0];

    const created = await request(app)
      .post('/api/docs')
      .set('Cookie', cookie)
      .send({ workspaceId: ws.id, title: '我的第一篇' });
    expect(created.status).toBe(200);
    const docId = created.body.doc.id;

    const read = await request(app).get(`/api/docs/${docId}`).set('Cookie', cookie);
    expect(read.status).toBe(200);
    expect(read.body.doc.title).toBe('我的第一篇');

    const updated = await request(app)
      .patch(`/api/docs/${docId}`)
      .set('Cookie', cookie)
      .send({ title: '改后的标题', contentJson: '{"type":"doc","content":[]}' });
    expect(updated.status).toBe(200);
    expect(updated.body.doc.title).toBe('改后的标题');

    const removed = await request(app)
      .delete(`/api/docs/${docId}`)
      .set('Cookie', cookie);
    expect(removed.status).toBe(200);
  });

  it('非所有者无法访问他人文档', async () => {
    const app = await getApp();
    const a = await registerUser('ownerA@test.local', 'OwnerA');
    const wsA = (await request(app).get('/api/workspaces').set('Cookie', a.cookie)).body.list[0];
    const doc = (
      await request(app)
        .post('/api/docs')
        .set('Cookie', a.cookie)
        .send({ workspaceId: wsA.id, title: '私密文档' })
    ).body.doc;

    const b = await registerUser('peerB@test.local', 'PeerB');
    const forbidden = await request(app).get(`/api/docs/${doc.id}`).set('Cookie', b.cookie);
    expect(forbidden.status).toBe(403);
  });

  it('导入 Markdown 时会持久化内嵌图片为文档附件', async () => {
    const app = await getApp();
    const { cookie } = await registerUser('import-md@test.local', 'ImportMd');
    const wsList = await request(app).get('/api/workspaces').set('Cookie', cookie);
    const ws = wsList.body.list[0];
    const markdown = [
      '# 带图片文档',
      '',
      '![pixel](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lwcc+QAAAABJRU5ErkJggg==)',
    ].join('\n');

    const imported = await request(app)
      .post('/api/docs/import')
      .set('Cookie', cookie)
      .field('workspaceId', ws.id)
      .attach('file', Buffer.from(markdown), {
        filename: 'with-image.md',
        contentType: 'text/markdown',
      });

    expect(imported.status).toBe(200);
    expect(imported.body.doc.contentJson).toContain('/api/attachments/');
    expect(imported.body.doc.contentJson).toContain('/raw');

    const attachment = await prisma.attachment.findFirst({
      where: { documentId: imported.body.doc.id, category: 'doc-image' },
    });
    expect(attachment?.mimeType).toBe('image/png');
  });

  it('文档树返回与列表一致的分类数量', async () => {
    const app = await getApp();
    const { cookie } = await registerUser('tree-count@test.local', 'TreeCount');
    const wsList = await request(app).get('/api/workspaces').set('Cookie', cookie);
    const ws = wsList.body.list[0];

    await request(app)
      .post('/api/docs')
      .set('Cookie', cookie)
      .send({ workspaceId: ws.id, title: '计数文档' });

    const tree = await request(app).get('/api/docs/tree').set('Cookie', cookie);

    expect(tree.status).toBe(200);
    expect(tree.body.mine).toHaveLength(1);
    expect(tree.body.counts).toMatchObject({
      mine: 1,
      public: tree.body.public.length,
      shared: tree.body.shared.length,
      favorites: tree.body.favorites.length,
    });
  });

  it('可以把我的知识库文档复制到公共知识库并复制附件链接', async () => {
    const app = await getApp();
    const { cookie } = await registerUser('copy-public@test.local', 'CopyPublic');
    const wsList = await request(app).get('/api/workspaces').set('Cookie', cookie);
    const privateWs = wsList.body.list[0];

    const created = await request(app)
      .post('/api/docs')
      .set('Cookie', cookie)
      .send({ workspaceId: privateWs.id, title: '私人文档', contentJson: '<p>hello</p>' });
    expect(created.status).toBe(200);

    const stored = await storeUploadBuffer(Buffer.from('image-bytes'), {
      subdir: 'attachments',
      originalName: 'copy.png',
    });
    const attachment = await prisma.attachment.create({
      data: {
        ownerId: created.body.doc.createdById,
        documentId: created.body.doc.id,
        category: 'doc-image',
        originalName: 'copy.png',
        storedName: stored.storedName,
        mimeType: 'image/png',
        size: 11,
      },
    });
    await prisma.document.update({
      where: { id: created.body.doc.id },
      data: { contentJson: `<img src="/api/attachments/${attachment.id}/raw">` },
    });

    const copied = await request(app)
      .post(`/api/docs/${created.body.doc.id}/copy-to-public`)
      .set('Cookie', cookie);

    expect(copied.status).toBe(200);
    expect(copied.body.copiedCount).toBe(1);
    expect(copied.body.doc.workspaceId).not.toBe(privateWs.id);
    expect(copied.body.doc.contentJson).not.toContain(attachment.id);
    expect(copied.body.doc.contentJson).toContain('/api/attachments/');

    const copiedAttachment = await prisma.attachment.findFirst({
      where: { documentId: copied.body.doc.id, category: 'doc-image' },
    });
    expect(copiedAttachment?.id).toBeTruthy();
    expect(copied.body.doc.contentJson).toContain(copiedAttachment!.id);

    const tree = await request(app).get('/api/docs/tree').set('Cookie', cookie);
    expect(tree.body.counts.public).toBeGreaterThanOrEqual(1);
  });

  it('私人文件夹不能复制到公共知识库，但可以整体移动过去', async () => {
    const app = await getApp();
    const { cookie } = await registerUser('move-folder-public@test.local', 'MoveFolderPublic');
    const wsList = await request(app).get('/api/workspaces').set('Cookie', cookie);
    const privateWs = wsList.body.list[0];

    const folder = await request(app)
      .post('/api/docs')
      .set('Cookie', cookie)
      .send({ workspaceId: privateWs.id, title: '私人文件夹', isFolder: true });
    expect(folder.status).toBe(200);

    const child = await request(app)
      .post('/api/docs')
      .set('Cookie', cookie)
      .send({ workspaceId: privateWs.id, title: '子文档', parentId: folder.body.doc.id });
    expect(child.status).toBe(200);

    const copied = await request(app)
      .post(`/api/docs/${folder.body.doc.id}/copy-to-public`)
      .set('Cookie', cookie);
    expect(copied.status).toBe(400);

    const moved = await request(app)
      .post(`/api/docs/${folder.body.doc.id}/move-to-public`)
      .set('Cookie', cookie);
    expect(moved.status).toBe(200);
    expect(moved.body.movedCount).toBe(2);
    expect(moved.body.doc.parentId).toBeNull();

    const tree = await request(app).get('/api/docs/tree').set('Cookie', cookie);
    const publicFolder = tree.body.public.find((item: { id: string }) => item.id === folder.body.doc.id);
    const publicChild = tree.body.public.find((item: { id: string }) => item.id === child.body.doc.id);
    expect(publicFolder?.isFolder).toBe(true);
    expect(publicFolder?.workspaceId).not.toBe(privateWs.id);
    expect(publicChild?.parentId).toBe(folder.body.doc.id);
    expect(tree.body.mine.find((item: { id: string }) => item.id === folder.body.doc.id)).toBeFalsy();
  });

  it('文件夹可以移动到另一个文件夹下', async () => {
    const app = await getApp();
    const { cookie } = await registerUser('move-folder-under-folder@test.local', 'MoveFolderNested');
    const wsList = await request(app).get('/api/workspaces').set('Cookie', cookie);
    const privateWs = wsList.body.list[0];

    const parent = await request(app)
      .post('/api/docs')
      .set('Cookie', cookie)
      .send({ workspaceId: privateWs.id, title: '父文件夹', isFolder: true });
    const childFolder = await request(app)
      .post('/api/docs')
      .set('Cookie', cookie)
      .send({ workspaceId: privateWs.id, title: '待移动文件夹', isFolder: true });

    const moved = await request(app)
      .patch(`/api/docs/${childFolder.body.doc.id}`)
      .set('Cookie', cookie)
      .send({ parentId: parent.body.doc.id });

    expect(moved.status).toBe(200);
    expect(moved.body.doc.parentId).toBe(parent.body.doc.id);
  });

  it('公共知识库支持文件夹和文档层级', async () => {
    const app = await getApp();
    const { cookie } = await registerUser('public-folder@test.local', 'PublicFolder');

    const folder = await request(app)
      .post('/api/docs')
      .set('Cookie', cookie)
      .send({ workspaceKind: 'PUBLIC', title: '产品文档', isFolder: true });
    expect(folder.status).toBe(200);
    expect(folder.body.doc.isFolder).toBe(true);

    const doc = await request(app)
      .post('/api/docs')
      .set('Cookie', cookie)
      .send({ workspaceKind: 'PUBLIC', title: '需求说明', parentId: folder.body.doc.id });
    expect(doc.status).toBe(200);
    expect(doc.body.doc.parentId).toBe(folder.body.doc.id);

    const tree = await request(app).get('/api/docs/tree').set('Cookie', cookie);
    const folderNode = tree.body.public.find((item: { id: string }) => item.id === folder.body.doc.id);
    const childNode = tree.body.public.find((item: { id: string }) => item.id === doc.body.doc.id);
    expect(folderNode?.isFolder).toBe(true);
    expect(childNode?.parentId).toBe(folder.body.doc.id);
    expect(tree.body.counts.public).toBe(1);
  });
});
