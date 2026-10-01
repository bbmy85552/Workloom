import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { getApp, registerUser, resetData } from './helpers.js';

beforeAll(async () => {
  await getApp();
});

afterEach(async () => {
  await resetData();
});

async function userWithKey(email: string, name: string) {
  const app = await getApp();
  const { cookie } = await registerUser(email, name);
  const keyRes = await request(app).post('/api/me/cli-key/regenerate').set('Cookie', cookie);
  expect(keyRes.status).toBe(200);
  return { cookie, key: keyRes.body.apiKey.key as string };
}

function mcpHeaders(apiKey: string) {
  return { Authorization: `Bearer ${apiKey}`, Accept: 'application/json, text/event-stream' };
}

async function callTool(path: string, key: string, name: string, args: Record<string, unknown>) {
  const app = await getApp();
  const res = await request(app)
    .post(path)
    .set(mcpHeaders(key))
    .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  expect(res.status).toBe(200);
  return res.body.result as { content: { type: string; text: string }[]; isError?: boolean };
}

describe('project memory REST', () => {
  it('creates private/public projects with knowledge-base style permissions', async () => {
    const app = await getApp();
    const a = await userWithKey('mem-a@test.local', 'Alice');
    const b = await userWithKey('mem-b@test.local', 'Bob');

    const priv = await request(app)
      .post('/api/memory/projects')
      .set('Cookie', a.cookie)
      .send({ name: '私人项目', workspaceKind: 'PRIVATE' });
    expect(priv.status).toBe(200);
    const pub = await request(app)
      .post('/api/memory/projects')
      .set('Cookie', a.cookie)
      .send({ name: '公共项目', workspaceKind: 'PUBLIC' });
    expect(pub.status).toBe(200);
    const privId = priv.body.project.id as string;
    const pubId = pub.body.project.id as string;

    const item = await request(app)
      .post(`/api/memory/projects/${privId}/items`)
      .set('Cookie', a.cookie)
      .send({ kind: 'decision', content: '使用 SQLite', tags: ['db'] });
    expect(item.status).toBe(200);
    expect(item.body.item.tags).toEqual(['db']);

    // Bob 看不到 Alice 的私人项目
    expect((await request(app).get(`/api/memory/projects/${privId}`).set('Cookie', b.cookie)).status).toBe(403);
    // Bob 可以读公共项目，但不能写
    const bobPub = await request(app).get(`/api/memory/projects/${pubId}`).set('Cookie', b.cookie);
    expect(bobPub.status).toBe(200);
    expect(bobPub.body.access.canWrite).toBe(false);
    expect(
      (await request(app).post(`/api/memory/projects/${pubId}/items`).set('Cookie', b.cookie).send({ content: 'x' }))
        .status,
    ).toBe(403);

    const bobList = await request(app).get('/api/memory/projects?tab=public').set('Cookie', b.cookie);
    expect(bobList.body.list.map((p: { id: string }) => p.id)).toContain(pubId);
    expect(bobList.body.counts.mine).toBe(0);

    // 邀请 Bob 为私人项目 EDITOR 后，出现在 shared 中且可写
    const bobId = (await request(app).get('/api/auth/me').set('Cookie', b.cookie)).body.user?.id;
    const invite = await request(app)
      .post(`/api/memory/projects/${privId}/collaborators`)
      .set('Cookie', a.cookie)
      .send({ email: 'mem-b@test.local', role: 'EDITOR' });
    expect(invite.status).toBe(200);
    if (bobId) expect(invite.body.collaborator.userId).toBe(bobId);
    const shared = await request(app).get('/api/memory/projects?tab=shared').set('Cookie', b.cookie);
    expect(shared.body.list.map((p: { id: string }) => p.id)).toContain(privId);
    const bobItem = await request(app)
      .post(`/api/memory/projects/${privId}/items`)
      .set('Cookie', b.cookie)
      .send({ kind: 'fact', content: 'Bob 补充' });
    expect(bobItem.status).toBe(200);
    // EDITOR 不能删除项目
    expect((await request(app).delete(`/api/memory/projects/${privId}`).set('Cookie', b.cookie)).status).toBe(403);

    // 条目不能跨项目修改
    const cross = await request(app)
      .patch(`/api/memory/projects/${pubId}/items/${item.body.item.id}`)
      .set('Cookie', a.cookie)
      .send({ content: 'hack' });
    expect(cross.status).toBe(404);

    const md = await request(app).get(`/api/memory/projects/${privId}/markdown`).set('Cookie', a.cookie);
    expect(md.body.markdown).toContain('使用 SQLite');
    expect(md.body.markdown).toContain('Bob 补充');

    expect((await request(app).delete(`/api/memory/projects/${privId}`).set('Cookie', a.cookie)).status).toBe(200);
    expect((await request(app).get(`/api/memory/projects/${privId}`).set('Cookie', a.cookie)).status).toBe(404);
  });
});

describe('project memory MCP', () => {
  it('exposes memory-only tools on /mcp/memory and memory tools on /mcp', async () => {
    const app = await getApp();
    const a = await userWithKey('mem-mcp@test.local', 'Mcp');

    const list = await request(app)
      .post('/mcp/memory')
      .set(mcpHeaders(a.key))
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    expect(list.status).toBe(200);
    const names = list.body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'memory_projects_list',
        'memory_project_create',
        'memory_get',
        'memory_add',
        'memory_update',
        'memory_delete',
        'memory_search',
      ]),
    );
    expect(names).not.toContain('docs_create');
    const getTool = list.body.result.tools.find((t: { name: string }) => t.name === 'memory_get');
    expect(getTool.annotations.readOnlyHint).toBe(true);

    const full = await request(app)
      .post('/mcp')
      .set(mcpHeaders(a.key))
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    const fullNames = full.body.result.tools.map((t: { name: string }) => t.name);
    expect(fullNames).toContain('docs_create');
    expect(fullNames).toContain('memory_get');

    expect((await request(app).get('/mcp/memory')).status).toBe(405);
    expect((await request(app).post('/mcp/memory').send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).status).toBe(401);

    const created = await callTool('/mcp/memory', a.key, 'memory_project_create', { name: 'MCP 项目' });
    const projectId = JSON.parse(created.content[0].text).project.id as string;
    const added = await callTool('/mcp/memory', a.key, 'memory_add', {
      projectName: 'MCP 项目',
      kind: 'preference',
      content: '回复使用繁体中文',
      tags: ['语言'],
    });
    const itemId = JSON.parse(added.content[0].text).item.id as string;
    await callTool('/mcp/memory', a.key, 'memory_add', { projectId, kind: 'note', content: '未置顶的', pinned: false });

    const got = await callTool('/mcp/memory', a.key, 'memory_get', { projectId });
    expect(got.content[0].text).toContain('回复使用繁体中文');
    expect(got.content[0].text).toContain(itemId);
    expect(got.content[0].text).not.toContain('未置顶的');

    const found = await callTool('/mcp/memory', a.key, 'memory_search', { q: '繁体' });
    expect(JSON.parse(found.content[0].text).items).toHaveLength(1);

    await callTool('/mcp/memory', a.key, 'memory_update', { projectId, itemId, content: '回复使用简体中文' });
    const del = await callTool('/mcp/memory', a.key, 'memory_delete', { projectId, itemId });
    expect(del.isError).toBeFalsy();
    const after = await callTool('/mcp/memory', a.key, 'memory_get', { projectId });
    expect(after.content[0].text).not.toContain('简体中文');
  });

  it('works with the official SDK client on /mcp/memory', async () => {
    const app = await getApp();
    const a = await userWithKey('mem-sdk@test.local', 'Sdk');
    const listener = app.listen(0);
    const address = listener.address();
    if (!address || typeof address === 'string') throw new Error('bind failed');
    const client = new Client({ name: 'memory-test', version: '0.1.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp/memory`), {
      requestInit: { headers: { Authorization: `Bearer ${a.key}` } },
    });
    try {
      await client.connect(transport);
      expect(client.getInstructions()).toContain('memory_get');
      const res = await client.callTool({ name: 'memory_projects_list', arguments: {} });
      const t = res.content as { type: string; text: string }[];
      expect(JSON.parse(t[0].text).projects).toEqual([]);
    } finally {
      await transport.close().catch(() => undefined);
      await new Promise<void>((resolve) => listener.close(() => resolve()));
    }
  });
});

describe('table record ownership check', () => {
  it('rejects updating/deleting a record through another table id', async () => {
    const app = await getApp();
    const a = await userWithKey('tbl-a@test.local', 'A');
    const b = await userWithKey('tbl-b@test.local', 'B');
    const tA = await callTool('/mcp', a.key, 'tables_create', { name: 'A表', records: [{ 名称: 'a' }] });
    const tableA = JSON.parse(tA.content[0].text).table.id as string;
    const getA = await callTool('/mcp', a.key, 'tables_get', { id: tableA });
    const recordA = JSON.parse(getA.content[0].text).records[0].id as string;
    const tB = await callTool('/mcp', b.key, 'tables_create', { name: 'B表' });
    const tableB = JSON.parse(tB.content[0].text).table.id as string;

    const mcpDel = await callTool('/mcp', b.key, 'table_records_delete', { tableId: tableB, recordId: recordA });
    expect(mcpDel.isError).toBe(true);
    const restDel = await request(app).delete(`/api/tables/${tableB}/records/${recordA}`).set('Cookie', b.cookie);
    expect(restDel.status).toBe(404);
    const cliDel = await request(app)
      .delete(`/api/cli/tables/${tableB}/records/${recordA}`)
      .set('Authorization', `Bearer ${b.key}`);
    expect(cliDel.status).toBe(404);
    const stillThere = await callTool('/mcp', a.key, 'tables_get', { id: tableA });
    expect(JSON.parse(stillThere.content[0].text).records).toHaveLength(1);
  });
});
