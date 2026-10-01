import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { getApp, registerUser, resetData } from './helpers.js';
import { prisma } from '../src/prisma.js';

beforeAll(async () => {
  await getApp();
});

afterEach(async () => {
  await resetData();
});

describe('CLI API', () => {
  it('can regenerate a user API key and manage docs/tables through CLI routes', async () => {
    const app = await getApp();
    const { cookie } = await registerUser('cli@test.local', 'CLI User');

    const keyRes = await request(app).post('/api/me/cli-key/regenerate').set('Cookie', cookie);
    expect(keyRes.status).toBe(200);
    expect(keyRes.body.apiKey.key).toMatch(/^jj_live_/);
    const auth = { Authorization: `Bearer ${keyRes.body.apiKey.key}` };

    const me = await request(app).get('/api/cli/me').set(auth);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('cli@test.local');

    const createdDoc = await request(app)
      .post('/api/cli/docs')
      .set(auth)
      .send({ title: 'AI 文档', contentJson: '<p>Hello AI</p>' });
    expect(createdDoc.status).toBe(200);
    expect(createdDoc.body.doc.title).toBe('AI 文档');

    const updatedDoc = await request(app)
      .patch(`/api/cli/docs/${createdDoc.body.doc.id}`)
      .set(auth)
      .send({ title: 'AI 文档更新' });
    expect(updatedDoc.status).toBe(200);
    expect(updatedDoc.body.doc.title).toBe('AI 文档更新');

    const createdTable = await request(app)
      .post('/api/cli/tables')
      .set(auth)
      .send({
        name: 'AI 表格',
        fields: [
          { name: '任务', type: 'text' },
          { name: '状态', type: 'select', options: { choices: ['待办', '完成'] } },
        ],
        records: [{ 任务: '写测试', 状态: '完成' }],
      });
    expect(createdTable.status).toBe(200);

    const tableDetail = await request(app).get(`/api/cli/tables/${createdTable.body.table.id}`).set(auth);
    expect(tableDetail.status).toBe(200);
    expect(tableDetail.body.fields).toHaveLength(2);
    expect(tableDetail.body.records[0].data.任务).toBe('写测试');

    const record = await request(app)
      .post(`/api/cli/tables/${createdTable.body.table.id}/records`)
      .set(auth)
      .send({ data: { 任务: '继续完善', 状态: '待办' } });
    expect(record.status).toBe(200);
    expect(record.body.record.data.状态).toBe('待办');

    const keyRow = await prisma.apiKey.findFirstOrThrow();
    expect(keyRow.lastUsedAt).toBeTruthy();
  });

  it('invalid API key cannot access CLI routes', async () => {
    const app = await getApp();
    const res = await request(app).get('/api/cli/me').set({ Authorization: 'Bearer jj_live_wrong' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('API_KEY_INVALID');
  });
});
