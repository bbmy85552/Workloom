import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

test('new CLI settings take precedence while the previous entry point still works', async () => {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ url: req.url, authorization: req.headers.authorization });
    res.setHeader('Content-Type', 'application/json');
    res.end('{"user":{"name":"Preview"}}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    for (const script of ['workloom-cli.mjs', 'docs-platform-cli.mjs']) {
      const child = spawn(process.execPath, [new URL(script, import.meta.url).pathname, 'me'], {
        env: {
          ...process.env,
          WORKLOOM_BASE_URL: baseUrl,
          WORKLOOM_API_KEY: 'wl_live_test-only',
          DOCS_PLATFORM_BASE_URL: 'http://127.0.0.1:1',
          DOCS_PLATFORM_API_KEY: 'wrong-legacy-key',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      let errors = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { errors += chunk; });
      const code = await new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', resolve);
      });
      assert.equal(code, 0, errors);
      assert.equal(JSON.parse(output).user.name, 'Preview');
    }
    assert.deepEqual(requests, [
      { url: '/api/cli/me', authorization: 'Bearer wl_live_test-only' },
      { url: '/api/cli/me', authorization: 'Bearer wl_live_test-only' },
    ]);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
