# docs-platform MCP 使用说明

docs-platform 提供远程 MCP 入口，让支持 MCP 的 AI 客户端直接管理你的文档和数据表。

## 入口地址

生产环境 MCP 地址：

```text
https://company.2dqy.com/mcp
```

本地开发 MCP 地址：

```text
http://127.0.0.1:4000/mcp
```

MCP 使用 Streamable HTTP transport（无状态，仅 POST），请在客户端里选择远程 HTTP/Streamable HTTP 类型。

另有一个**只包含项目记忆工具**的入口，工具列表更短，推荐日常 AI 对话 / 编码使用：

```text
https://company.2dqy.com/mcp/memory
```

两个入口使用同一个 API Key、同一套权限；`/mcp` 同时包含文档、数据表和项目记忆全部工具。

## 获取 API Key

登录 docs-platform 后进入：

```text
设置 -> AI 与 CLI（/app/settings/cli）
```

在这里可以生成、重建或删除 API Key。

注意：

- API Key 明文只在生成或重建后显示一次。
- 后端只保存 API Key 的 hash，之后无法反查明文。
- 重建 API Key 后，旧 key 会立即失效。
- 不要把 API Key 写进公开仓库、截图或共享文档。

## 认证方式

MCP 请求使用 Bearer token：

```http
Authorization: Bearer jj_live_xxx
```

所有 MCP 操作都会以这个 API Key 对应的用户身份执行，并沿用 docs-platform 现有权限：

- 私人文档只允许本人和协作者访问。
- 公共文档按系统公共知识库权限访问。
- 数据表遵循 owner/editor/viewer 权限。
- 项目记忆与知识库权限一致：私人项目仅本人和协作者可访问；公共项目所有登录用户可查看，创建者 / 管理员 / 被邀请为可编辑的用户可写。
- 公共文档删除会进入回收站，不会绕过现有保护。

## 客户端配置示例

### Cursor（`~/.cursor/mcp.json` 或项目内 `.cursor/mcp.json`）

```json
{
  "mcpServers": {
    "jianji-memory": {
      "url": "https://company.2dqy.com/mcp/memory",
      "headers": { "Authorization": "Bearer jj_live_xxx" }
    }
  }
}
```

### Claude Code

```bash
claude mcp add --transport http jianji-memory https://company.2dqy.com/mcp/memory \
  --header "Authorization: Bearer jj_live_xxx"
```

### Claude Desktop（`claude_desktop_config.json`，需本机安装 Node.js，改完重启）

```json
{
  "mcpServers": {
    "jianji-memory": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://company.2dqy.com/mcp/memory", "--header", "Authorization:${JIANJI_AUTH}"],
      "env": { "JIANJI_AUTH": "Bearer jj_live_xxx" }
    }
  }
}
```

### Claude 网页版 / ChatGPT 网页版

- Claude 网页版：设置 → 连接器 → 添加自定义连接器，填 `https://company.2dqy.com/mcp/memory`，在高级设置的请求头中填 `Authorization: Bearer jj_live_xxx`（Anthropic 标注为 Beta，且是组织共用凭证）。
- ChatGPT 网页版（开发者模式）目前只支持 OAuth / 无认证，本阶段未实现 OAuth，暂不能直连；请在项目记忆页面使用「复制全部记忆」。

### 通用格式

不同 MCP 客户端的配置界面不同，但核心信息相同：

```json
{
  "name": "docs-platform",
  "url": "https://company.2dqy.com/mcp",
  "headers": {
    "Authorization": "Bearer jj_live_xxx"
  }
}
```

如果客户端只支持环境变量，可以这样设置：

```bash
export DOCS_PLATFORM_BASE_URL="https://company.2dqy.com"
export DOCS_PLATFORM_API_KEY="jj_live_xxx"
```

## 可用工具

### 用户

```text
docs_platform_me
```

返回当前 API Key 对应的用户信息。

### 文档

```text
docs_list
docs_get
docs_create
docs_update
docs_delete
```

常见参数：

- `scope`: `mine`、`public`、`shared`、`all`
- `q`: 按标题搜索
- `limit`: 返回数量，最大 200
- `title`: 文档标题
- `contentJson`: 文档 HTML 内容
- `workspaceKind`: `PRIVATE` 或 `PUBLIC`
- `parentId`: 父文档或文件夹 id
- `isFolder`: 是否创建文件夹

### 数据表

```text
tables_list
tables_get
tables_create
tables_update
tables_delete
```

### 数据表字段

```text
table_fields_create
table_fields_update
table_fields_delete
```

字段类型支持：

```text
text
longtext
number
date
datetime
select
multiselect
checkbox
url
email
phone
rating
progress
user
attachment
formula
```

### 项目记忆

```text
memory_projects_list
memory_project_create
memory_get
memory_add
memory_update
memory_delete
memory_search
```

- `memory_projects_list`：列出可访问的项目，`scope` 为 `mine`、`public`、`shared`、`all`。
- `memory_project_create`：新建项目，`visibility` 为 `private`（默认）或 `public`（团队所有人可见）。
- `memory_get`：**开始项目工作前调用**。以 Markdown 返回项目信息和全部置顶记忆（含条目 id）；`includeUnpinned: true` 时包含未置顶条目。
- `memory_add`：写入一条记忆，`kind` 为 `fact`（事实）、`decision`（决策）、`preference`（偏好）、`note`（笔记）、`todo`（待办），可带 `title`、`tags`、`pinned`、`source`。
- `memory_update` / `memory_delete`：按 `itemId` 修改或删除（软删除）。
- `memory_search`：按关键字搜索标题 / 内容 / 标签，可限定 `projectId`、`kind`。
- 涉及项目的工具都可以用 `projectId`，也可以直接传唯一的 `projectName`。

网页端：左侧导航「项目记忆」可管理项目和条目、邀请协作者，并提供「复制全部记忆」（Markdown），方便粘贴到不支持 MCP 的平台。

### 数据表记录

```text
table_records_create
table_records_update
table_records_delete
```

记录数据使用 JSON 对象，例如：

```json
{
  "任务": "整理资料",
  "状态": "进行中"
}
```

## JSON-RPC 测试示例

列出工具：

```bash
curl https://company.2dqy.com/mcp \
  -H "Authorization: Bearer jj_live_xxx" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'
```

创建文档：

```bash
curl https://company.2dqy.com/mcp \
  -H "Authorization: Bearer jj_live_xxx" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "docs_create",
      "arguments": {
        "title": "AI 创建的文档",
        "contentJson": "<p>Hello from MCP</p>"
      }
    }
  }'
```

创建数据表：

```bash
curl https://company.2dqy.com/mcp \
  -H "Authorization: Bearer jj_live_xxx" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "tables_create",
      "arguments": {
        "name": "AI 任务表",
        "fields": [
          { "name": "任务", "type": "text" },
          { "name": "状态", "type": "select", "options": { "choices": ["待办", "进行中", "完成"] } }
        ],
        "records": [
          { "任务": "测试 MCP", "状态": "完成" }
        ]
      }
    }
  }'
```

## 本地 CLI

仓库内也提供一个本地 CLI，方便开发和排查：

```bash
export DOCS_PLATFORM_BASE_URL="https://company.2dqy.com"
export DOCS_PLATFORM_API_KEY="jj_live_xxx"

npm run docs-platform -- docs list
npm run docs-platform -- docs create --title "AI 笔记" --content "<p>Hello</p>"
npm run docs-platform -- tables list
```

这个 CLI 是开发辅助工具。给 AI 客户端使用时，优先配置远程 MCP 地址。

## 排查

如果客户端无法连接：

1. 确认 MCP 地址是 `https://company.2dqy.com/mcp` 或 `https://company.2dqy.com/mcp/memory`。
2. 确认请求带了 `Authorization: Bearer jj_live_xxx`。
3. 确认 API Key 没有被重建或删除。
4. 先用 `tools/list` 测试是否能列出工具。
5. 如果网页能登录但 MCP 失败，重新生成 API Key 后再试。
