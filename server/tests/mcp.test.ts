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

async function createApiKey(email = 'mcp@test.local') {
  const app = await getApp();
  const { cookie } = await registerUser(email, 'MCP User');
  const keyRes = await request(app).post('/api/me/cli-key/regenerate').set('Cookie', cookie);
  expect(keyRes.status).toBe(200);
  return keyRes.body.apiKey.key as string;
}

function mcpHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json, text/event-stream',
  };
}

describe('remote MCP endpoint', () => {
  it('rejects requests without API key', async () => {
    const app = await getApp();
    const res = await request(app)
      .post('/mcp')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toContain('缺少 API Key');
  });

  it('lists tools and calls docs/tables tools', async () => {
    const app = await getApp();
    const apiKey = await createApiKey();

    const tools = await request(app)
      .post('/mcp')
      .set(mcpHeaders(apiKey))
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    expect(tools.status).toBe(200);
    const names = tools.body.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toContain('docs_create');
    expect(names).toContain('tables_create');

    const doc = await request(app)
      .post('/mcp')
      .set(mcpHeaders(apiKey))
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'docs_create',
          arguments: { title: 'MCP 文档', contentJson: '<p>hello mcp</p>' },
        },
      });
    expect(doc.status).toBe(200);
    const docPayload = JSON.parse(doc.body.result.content[0].text);
    expect(docPayload.doc.title).toBe('MCP 文档');

    const table = await request(app)
      .post('/mcp')
      .set(mcpHeaders(apiKey))
      .send({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'tables_create',
          arguments: {
            name: 'MCP 表格',
            fields: [{ name: '任务', type: 'text' }],
            records: [{ 任务: '测试 MCP' }],
          },
        },
      });
    expect(table.status).toBe(200);
    const tablePayload = JSON.parse(table.body.result.content[0].text);
    expect(tablePayload.table.name).toBe('MCP 表格');
  });

  it('works with the official Streamable HTTP client transport', async () => {
    const app = await getApp();
    const apiKey = await createApiKey('mcp-client@test.local');
    const listener = app.listen(0);
    const address = listener.address();
    if (!address || typeof address === 'string') throw new Error('failed to bind test server');

    const client = new Client({ name: 'docs-platform-test-client', version: '0.1.0' });
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${address.port}/mcp`),
      {
        requestInit: {
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      },
    );
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.some((tool) => tool.name === 'docs_create')).toBe(true);

      const result = await client.callTool({
        name: 'docs_create',
        arguments: { title: 'SDK MCP 文档', contentJson: '<p>sdk client</p>' },
      });
      const text = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
      expect(JSON.parse(text).doc.title).toBe('SDK MCP 文档');
    } finally {
      await transport.close().catch(() => undefined);
      await new Promise<void>((resolve) => listener.close(() => resolve()));
    }
  });
});
