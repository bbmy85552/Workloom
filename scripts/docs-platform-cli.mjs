#!/usr/bin/env node

const DEFAULT_BASE_URL = 'http://127.0.0.1:4000';

function usage() {
  console.log(`docs-platform CLI

Environment:
  DOCS_PLATFORM_BASE_URL   API base URL, default ${DEFAULT_BASE_URL}
  DOCS_PLATFORM_API_KEY    User API key from Settings > Password & Email

Commands:
  me
  workspaces

  docs list [--scope all|mine|public|shared] [--q text] [--limit n]
  docs get <id>
  docs create --title title [--content text|--content-file path] [--workspace-id id] [--public]
  docs update <id> [--title title] [--content text|--content-file path]
  docs delete <id>

  tables list [--q text]
  tables get <id>
  tables create --name name [--fields '[{"name":"名称","type":"text"}]'] [--records '[{"名称":"示例"}]']
  tables update <id> --name name
  tables delete <id>
  tables fields add <tableId> --name name [--type text]
  tables fields update <tableId> <fieldId> [--name name] [--options '{"choices":["A","B"]}']
  tables fields delete <tableId> <fieldId>
  tables records add <tableId> --data '{"名称":"示例"}'
  tables records update <tableId> <recordId> --data '{"名称":"更新"}'
  tables records delete <tableId> <recordId>

Examples:
  DOCS_PLATFORM_API_KEY=jj_live_xxx node scripts/docs-platform-cli.mjs docs list
  node scripts/docs-platform-cli.mjs docs create --title "AI 笔记" --content-file note.html
  node scripts/docs-platform-cli.mjs tables records add TABLE_ID --data '{"任务":"整理资料","状态":"进行中"}'
`);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) {
      positional.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i += 1;
    }
  }
  return { positional, flags };
}

async function readContent(flags) {
  if (typeof flags.content === 'string') return flags.content;
  if (typeof flags['content-file'] === 'string') {
    const fs = await import('node:fs/promises');
    return fs.readFile(flags['content-file'], 'utf8');
  }
  return undefined;
}

function parseJsonFlag(flags, key, fallback) {
  if (flags[key] === undefined) return fallback;
  try {
    return JSON.parse(String(flags[key]));
  } catch (err) {
    throw new Error(`--${key} 不是有效 JSON`);
  }
}

function requireValue(value, label) {
  if (!value || value === true) throw new Error(`缺少 ${label}`);
  return String(value);
}

async function request(path, options = {}) {
  const baseUrl = (process.env.DOCS_PLATFORM_BASE_URL || process.env.JIANJI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const apiKey = process.env.DOCS_PLATFORM_API_KEY || process.env.JIANJI_API_KEY;
  if (!apiKey) throw new Error('缺少 DOCS_PLATFORM_API_KEY 环境变量');
  const res = await fetch(`${baseUrl}/api/cli${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message = data?.error || data?.message || `HTTP ${res.status}`;
    const err = new Error(message);
    err.response = data;
    throw err;
  }
  return data;
}

function print(data) {
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [resource, action, idOrSub, maybeId] = positional;
  if (!resource || resource === 'help' || resource === '--help') {
    usage();
    return;
  }

  if (resource === 'me') return print(await request('/me'));
  if (resource === 'workspaces') return print(await request('/workspaces'));

  if (resource === 'docs') {
    if (action === 'list') {
      const params = new URLSearchParams();
      if (flags.scope) params.set('scope', String(flags.scope));
      if (flags.q) params.set('q', String(flags.q));
      if (flags.limit) params.set('limit', String(flags.limit));
      return print(await request(`/docs${params.size ? `?${params}` : ''}`));
    }
    if (action === 'get') return print(await request(`/docs/${requireValue(idOrSub, '文档 id')}`));
    if (action === 'create') {
      return print(
        await request('/docs', {
          method: 'POST',
          body: {
            title: requireValue(flags.title, '--title'),
            contentJson: await readContent(flags),
            workspaceId: typeof flags['workspace-id'] === 'string' ? flags['workspace-id'] : undefined,
            workspaceKind: flags.public ? 'PUBLIC' : undefined,
            isFolder: Boolean(flags.folder),
          },
        }),
      );
    }
    if (action === 'update') {
      return print(
        await request(`/docs/${requireValue(idOrSub, '文档 id')}`, {
          method: 'PATCH',
          body: {
            title: typeof flags.title === 'string' ? flags.title : undefined,
            contentJson: await readContent(flags),
          },
        }),
      );
    }
    if (action === 'delete') {
      return print(await request(`/docs/${requireValue(idOrSub, '文档 id')}`, { method: 'DELETE' }));
    }
  }

  if (resource === 'tables') {
    if (action === 'list') {
      const params = new URLSearchParams();
      if (flags.q) params.set('q', String(flags.q));
      return print(await request(`/tables${params.size ? `?${params}` : ''}`));
    }
    if (action === 'get') return print(await request(`/tables/${requireValue(idOrSub, '数据表 id')}`));
    if (action === 'create') {
      return print(
        await request('/tables', {
          method: 'POST',
          body: {
            name: requireValue(flags.name, '--name'),
            workspaceId: typeof flags['workspace-id'] === 'string' ? flags['workspace-id'] : undefined,
            fields: parseJsonFlag(flags, 'fields', undefined),
            records: parseJsonFlag(flags, 'records', undefined),
          },
        }),
      );
    }
    if (action === 'update') {
      return print(
        await request(`/tables/${requireValue(idOrSub, '数据表 id')}`, {
          method: 'PATCH',
          body: { name: requireValue(flags.name, '--name') },
        }),
      );
    }
    if (action === 'delete') {
      return print(await request(`/tables/${requireValue(idOrSub, '数据表 id')}`, { method: 'DELETE' }));
    }
    if (action === 'fields') {
      const sub = positional[2];
      if (sub === 'add') {
        const realTableId = requireValue(positional[3], '数据表 id');
        return print(
          await request(`/tables/${realTableId}/fields`, {
            method: 'POST',
            body: {
              name: requireValue(flags.name, '--name'),
              type: typeof flags.type === 'string' ? flags.type : 'text',
              options: parseJsonFlag(flags, 'options', undefined),
            },
          }),
        );
      }
      if (sub === 'update') {
        const realTableId = requireValue(positional[3], '数据表 id');
        const realFieldId = requireValue(positional[4], '字段 id');
        return print(
          await request(`/tables/${realTableId}/fields/${realFieldId}`, {
            method: 'PATCH',
            body: {
              name: typeof flags.name === 'string' ? flags.name : undefined,
              options: parseJsonFlag(flags, 'options', undefined),
            },
          }),
        );
      }
      if (sub === 'delete') {
        const realTableId = requireValue(positional[3], '数据表 id');
        const realFieldId = requireValue(positional[4], '字段 id');
        return print(await request(`/tables/${realTableId}/fields/${realFieldId}`, { method: 'DELETE' }));
      }
    }
    if (action === 'records') {
      const sub = positional[2];
      if (sub === 'add') {
        const tableId = requireValue(positional[3], '数据表 id');
        return print(
          await request(`/tables/${tableId}/records`, {
            method: 'POST',
            body: { data: parseJsonFlag(flags, 'data', {}) },
          }),
        );
      }
      if (sub === 'update') {
        const tableId = requireValue(positional[3], '数据表 id');
        const recordId = requireValue(positional[4], '记录 id');
        return print(
          await request(`/tables/${tableId}/records/${recordId}`, {
            method: 'PATCH',
            body: { data: parseJsonFlag(flags, 'data', {}) },
          }),
        );
      }
      if (sub === 'delete') {
        const tableId = requireValue(positional[3], '数据表 id');
        const recordId = requireValue(positional[4], '记录 id');
        return print(await request(`/tables/${tableId}/records/${recordId}`, { method: 'DELETE' }));
      }
    }
  }

  usage();
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message);
  if (err.response) console.error(JSON.stringify(err.response, null, 2));
  process.exit(1);
});
