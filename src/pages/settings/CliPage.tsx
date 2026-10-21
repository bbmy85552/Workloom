import { useEffect, useMemo, useState } from 'react';
import { api, asApiError } from '../../lib/api';
import { useUiStore } from '../../store/ui';
import { Field, SettingsLayout } from './SettingsLayout';

interface CliApiKeyInfo {
  id: string;
  prefix: string;
  masked: string;
  createdAt: string;
  regeneratedAt?: string | null;
  lastUsedAt?: string | null;
}

const MCP_URL = 'https://company.2dqy.com/mcp';
const MEMORY_MCP_URL = 'https://company.2dqy.com/mcp/memory';
const BASE_URL = 'https://company.2dqy.com';

function formatDate(value?: string | null) {
  if (!value) return '从未使用';
  return new Date(value).toLocaleString();
}

function CodeBlock({ value }: { value: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-black/10 bg-surface-container-lowest px-4 py-3 text-xs leading-relaxed text-text-primary">
      <code>{value}</code>
    </pre>
  );
}

export function CliPage() {
  const showToast = useUiStore((s) => s.showToast);
  const [cliKey, setCliKey] = useState<CliApiKeyInfo | null>(null);
  const [newCliKey, setNewCliKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .get<{ apiKey: CliApiKeyInfo | null }>('/me/cli-key')
      .then(({ data }) => {
        if (alive) setCliKey(data.apiKey);
      })
      .catch((err) => showToast(asApiError(err).error, 'error'))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [showToast]);

  const activeKey = newCliKey || cliKey?.masked || 'jj_live_xxx';

  const mcpConfig = useMemo(
    () =>
      JSON.stringify(
        {
          name: 'docs-platform',
          url: MCP_URL,
          headers: {
            Authorization: `Bearer ${activeKey}`,
          },
        },
        null,
        2,
      ),
    [activeKey],
  );

  const memoryCursorConfig = JSON.stringify(
    {
      mcpServers: {
        'workloom-memory': {
          url: MEMORY_MCP_URL,
          headers: { Authorization: `Bearer ${activeKey}` },
        },
      },
    },
    null,
    2,
  );

  const memoryClaudeDesktopConfig = JSON.stringify(
    {
      mcpServers: {
        'workloom-memory': {
          command: 'npx',
          args: ['-y', 'mcp-remote', MEMORY_MCP_URL, '--header', 'Authorization:${JIANJI_AUTH}'],
          env: { JIANJI_AUTH: `Bearer ${activeKey}` },
        },
      },
    },
    null,
    2,
  );

  const memoryClaudeCode = `claude mcp add --transport http workloom-memory ${MEMORY_MCP_URL} \\
  --header "Authorization: Bearer ${activeKey}"`;

  const memoryPrompt = `开始任何项目相关工作前，先调用 workloom-memory 的 memory_projects_list 找到项目，再调用 memory_get 读取全部置顶记忆并遵循。
工作中确定了新的事实、决策或我的偏好时，用 memory_add 记录；发现记忆过时用 memory_update / memory_delete 修正。不要记录密码或密钥。`;

  const curlExample = `curl ${MCP_URL} \\
  -H "Authorization: Bearer ${activeKey}" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'`;

  const cliExample = `export DOCS_PLATFORM_BASE_URL="${BASE_URL}"
export DOCS_PLATFORM_API_KEY="${activeKey}"

npm run docs-platform -- docs list
npm run docs-platform -- docs create --title "AI 笔记" --content "<p>Hello</p>"
npm run docs-platform -- tables list`;

  const regenerateCliKey = async () => {
    if (cliKey && !window.confirm('重建后旧 API Key 会立即失效，继续吗？')) return;
    setSaving(true);
    try {
      const { data } = await api.post<{ apiKey: CliApiKeyInfo & { key: string } }>(
        '/me/cli-key/regenerate',
      );
      setCliKey(data.apiKey);
      setNewCliKey(data.apiKey.key);
      showToast('新的 API Key 已生成，请立即保存', 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      setSaving(false);
    }
  };

  const revokeCliKey = async () => {
    if (!window.confirm('确认删除当前 API Key？删除后 CLI 和 AI 工具将无法访问。')) return;
    setSaving(true);
    try {
      await api.delete('/me/cli-key');
      setCliKey(null);
      setNewCliKey('');
      showToast('API Key 已删除', 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      setSaving(false);
    }
  };

  const copyNewKey = async () => {
    if (!newCliKey) return;
    try {
      await navigator.clipboard.writeText(newCliKey);
      showToast('已复制到剪贴板', 'success');
    } catch {
      showToast('复制失败,请手动选择文本复制', 'error');
    }
  };

  return (
    <SettingsLayout title="AI 与 CLI" subtitle="为 AI 客户端、MCP 和命令行创建访问凭证。">
      <div className="space-y-8">
        <section className="border-b border-black/10 pb-8">
          <div className="text-sm font-semibold text-text-primary mb-2">API Key</div>
          <p className="text-xs text-text-secondary mb-4">
            每个用户只有一个 API Key。重建后旧 Key 会立即失效，明文只显示这一次。
          </p>

          <div className="rounded-xl border border-black/10 bg-surface-container-lowest p-4 mb-4">
            {loading ? (
              <div className="text-sm text-text-secondary">加载中…</div>
            ) : cliKey ? (
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <div className="text-xs text-text-secondary mb-1">当前 Key</div>
                  <div className="font-mono text-text-primary break-all">{cliKey.masked}</div>
                </div>
                <div>
                  <div className="text-xs text-text-secondary mb-1">最近使用</div>
                  <div className="text-text-primary">{formatDate(cliKey.lastUsedAt)}</div>
                </div>
                <div className="sm:col-span-2 text-xs text-text-secondary">
                  创建：{new Date(cliKey.createdAt).toLocaleString()}
                  {cliKey.regeneratedAt
                    ? ` · 最近重建：${new Date(cliKey.regeneratedAt).toLocaleString()}`
                    : ''}
                </div>
              </div>
            ) : (
              <div className="text-sm text-text-secondary">还没有 API Key。</div>
            )}
          </div>

          {newCliKey && (
            <Field label="新 API Key" hint="请立即保存。关闭或刷新页面后将无法再次查看明文。">
              <div className="flex flex-col gap-2">
                <textarea
                  readOnly
                  value={newCliKey}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-liquid-indigo/30 bg-surface-container-lowest font-mono text-xs text-text-primary outline-none"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  type="button"
                  onClick={copyNewKey}
                  className="self-start px-3 py-2 rounded-xl border border-liquid-indigo/30 text-liquid-indigo text-sm font-medium hover:bg-liquid-indigo/5"
                >
                  复制 API Key
                </button>
              </div>
            </Field>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={regenerateCliKey}
              className="px-4 py-2 rounded-xl bg-liquid-indigo text-white text-sm font-medium hover:bg-primary transition-colors disabled:opacity-60"
            >
              {cliKey ? '重建 API Key' : '生成 API Key'}
            </button>
            {cliKey && (
              <button
                type="button"
                disabled={saving}
                onClick={revokeCliKey}
                className="px-4 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-60"
              >
                删除 API Key
              </button>
            )}
          </div>
        </section>

        <section className="space-y-4 border-b border-black/10 pb-8">
          <div>
            <div className="text-sm font-semibold text-text-primary mb-2">远程 MCP</div>
            <p className="text-xs text-text-secondary">
              支持远程 MCP 的客户端可以直接连接 docs-platform，不需要下载源码。
            </p>
          </div>
          <Field label="MCP 地址">
            <CodeBlock value={MCP_URL} />
          </Field>
          <Field label="客户端配置示例">
            <CodeBlock value={mcpConfig} />
          </Field>
          <Field label="测试 tools/list">
            <CodeBlock value={curlExample} />
          </Field>
        </section>

        <section className="space-y-4 border-b border-black/10 pb-8">
          <div>
            <div className="text-sm font-semibold text-text-primary mb-2">项目记忆 MCP</div>
            <p className="text-xs text-text-secondary">
              只包含项目记忆工具（memory_projects_list / memory_get / memory_add / memory_update / memory_delete /
              memory_search / memory_project_create），工具列表更短，适合日常 AI 编码与对话。使用同一个 API Key，
              权限与网页「项目记忆」一致。
            </p>
          </div>
          <Field label="项目记忆 MCP 地址">
            <CodeBlock value={MEMORY_MCP_URL} />
          </Field>
          <Field label="Cursor（~/.cursor/mcp.json 或项目 .cursor/mcp.json）">
            <CodeBlock value={memoryCursorConfig} />
          </Field>
          <Field label="Claude Code（终端执行）">
            <CodeBlock value={memoryClaudeCode} />
          </Field>
          <Field
            label="Claude Desktop（claude_desktop_config.json，需要本机已安装 Node.js）"
            hint="通过 mcp-remote 转接远程 MCP；修改后需重启 Claude Desktop。"
          >
            <CodeBlock value={memoryClaudeDesktopConfig} />
          </Field>
          <Field label="建议加到 AI 的自定义指令 / 项目规则">
            <CodeBlock value={memoryPrompt} />
          </Field>
          <div className="rounded-xl border border-black/10 bg-surface-container-low p-4 text-xs leading-6 text-text-secondary">
            Claude 网页版可在「设置 → 连接器 → 添加自定义连接器」填写上方地址，并在高级设置的请求头中填写
            Authorization（Beta，组织共用一个凭证）。ChatGPT 网页版目前需要 OAuth，暂不支持 API Key 连接，可在项目记忆页面点击「复制全部记忆」后粘贴使用。
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <div className="text-sm font-semibold text-text-primary mb-2">本地 CLI</div>
            <p className="text-xs text-text-secondary">
              CLI 主要用于开发和排查。AI 客户端优先使用远程 MCP 地址。
            </p>
          </div>
          <Field label="环境变量与命令">
            <CodeBlock value={cliExample} />
          </Field>
          <div className="rounded-xl border border-black/10 bg-surface-container-low p-4 text-xs leading-6 text-text-secondary">
            API Key 会以当前用户身份访问文档、数据表和项目记忆。不要把 API Key 写入公开仓库、截图或共享文档。
          </div>
        </section>
      </div>
    </SettingsLayout>
  );
}
