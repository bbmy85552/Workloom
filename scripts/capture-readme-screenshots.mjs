#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const chromePath =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const baseUrl = process.env.WORKLOOM_SCREENSHOT_BASE_URL || 'http://127.0.0.1:3000';
const email = process.env.WORKLOOM_SCREENSHOT_EMAIL || 'admin@workloom.local';
const password = process.env.WORKLOOM_SCREENSHOT_PASSWORD;
const width = Number(process.env.WORKLOOM_SCREENSHOT_WIDTH || 1920);
const height = Number(process.env.WORKLOOM_SCREENSHOT_HEIGHT || 1080);

if (!password) {
  throw new Error('Set WORKLOOM_SCREENSHOT_PASSWORD before capturing screenshots.');
}

const outputDir = path.resolve('docs/images');
const userDataDir = '/private/tmp/workloom-readme-chrome';
const debugPort = Number(process.env.WORKLOOM_CHROME_DEBUG_PORT || 9333);
const demoDocTitle = 'README 展示文档';
const demoDocContent = `
  <h1 style="text-align:center">Workloom文档编辑器</h1>
  <p style="text-align:center">
    <span style="color:#5E5CE6"><strong>字号、颜色、对齐、列表与附件</strong></span>
    都可以在同一个编辑界面中完成。
  </p>
  <h2>写作与协作</h2>
  <p>用富文本记录方案、会议纪要、灵感和项目文档，并通过分享功能邀请团队成员一起维护。</p>
  <ul>
    <li><span style="color:#2563EB">蓝色强调重点</span>，让关键信息更容易被扫描。</li>
    <li><mark>高亮标注</mark>待确认内容，后续可以继续评论和修订。</li>
    <li style="text-align:center">居中段落适合标题、摘要和展示型内容。</li>
  </ul>
  <blockquote>
    自托管不是把复杂留给用户，而是把数据控制权交还给用户。
  </blockquote>
`;

async function waitForJson(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function openTab(url) {
  const res = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  });
  if (!res.ok) throw new Error(`Unable to open Chrome tab: ${res.status}`);
  return res.json();
}

function cdpClient(webSocketDebuggerUrl) {
  let nextId = 1;
  const pending = new Map();
  const ws = new WebSocket(webSocketDebuggerUrl);
  const loaded = new Set();

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Page.loadEventFired') loaded.forEach((resolve) => resolve());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });

  return {
    ready: new Promise((resolve) => ws.addEventListener('open', resolve, { once: true })),
    send(method, params = {}) {
      const id = nextId++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    waitForLoad(timeoutMs = 15000) {
      return new Promise((resolve) => {
        const timer = setTimeout(resolve, timeoutMs);
        loaded.add(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
    close() {
      ws.close();
    },
  };
}

function parseCookie(setCookie) {
  const first = setCookie.split(';')[0];
  const idx = first.indexOf('=');
  return { name: first.slice(0, idx), value: first.slice(idx + 1) };
}

async function login() {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) throw new Error('Login response did not include a session cookie.');
  return parseCookie(setCookie);
}

async function authedJson(cookie, route, options = {}) {
  const res = await fetch(`${baseUrl}/api${route}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Cookie: `${cookie.name}=${cookie.value}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${route} failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function prepareDemoState(cookie) {
  await authedJson(cookie, '/me/preferences', {
    method: 'PUT',
    body: JSON.stringify({
      theme: 'light',
      language: 'zh-CN',
      themeColor: '#5E5CE6',
      defaultHome: '/app/dashboard',
      editorFontSize: 16,
      autoSaveSeconds: 1,
      notifyInApp: true,
      notifyEmail: false,
      calendarDefaultRemind: 15,
      mailListPageSize: 30,
      mailSyncLimit: 50,
    }),
  });

  const tree = await authedJson(cookie, '/docs/tree');
  const existing = [...(tree.mine || []), ...(tree.public || [])].find((doc) => doc.title === demoDocTitle);
  if (existing) {
    await authedJson(cookie, `/docs/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: demoDocTitle, contentJson: demoDocContent }),
    });
    return existing.id;
  }

  const { doc } = await authedJson(cookie, '/docs', {
    method: 'POST',
    body: JSON.stringify({
      workspaceKind: 'PRIVATE',
      title: demoDocTitle,
      contentJson: demoDocContent,
    }),
  });
  return doc.id;
}

async function capture(page, route, file) {
  await page.send('Page.navigate', { url: `${baseUrl}${route}` });
  await page.waitForLoad();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const result = await page.send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 90,
    fromSurface: true,
    clip: { x: 0, y: 0, width, height, scale: 1 },
  });
  await fs.writeFile(path.join(outputDir, file), Buffer.from(result.data, 'base64'));
  return { file, width, height };
}

await fs.mkdir(outputDir, { recursive: true });
await fs.rm(userDataDir, { recursive: true, force: true });

const cookie = await login();
const demoDocId = await prepareDemoState(cookie);
const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${userDataDir}`,
  `--window-size=${width},${height}`,
  'about:blank',
], { stdio: 'ignore' });

try {
  await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  const tab = await openTab(`${baseUrl}/app/dashboard`);
  const page = cdpClient(tab.webSocketDebuggerUrl);
  await page.ready;
  await page.send('Page.enable');
  await page.send('Network.enable');
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.send('Network.setCookie', {
    name: cookie.name,
    value: cookie.value,
    url: baseUrl,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  });

  const results = [];
  results.push(await capture(page, '/app/docs', 'workloom-knowledge.jpg'));
  results.push(await capture(page, `/app/docs/${demoDocId}`, 'workloom-editor.jpg'));
  results.push(await capture(page, '/app/tables', 'workloom-tables.jpg'));
  results.push(await capture(page, '/app/settings/cli', 'workloom-ai-settings.jpg'));
  page.close();
  console.log(JSON.stringify(results, null, 2));
} finally {
  chrome.kill('SIGTERM');
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
}
