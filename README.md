# Workloom

一个自托管协作工作空间，让知识、文档、数据、日程和团队工作在同一处衔接。

[简体中文](README.md) · [English](README.en.md) · [线上实例](https://company.2dqy.com) · [部署配置](配置说明.md) · [MCP 与 CLI](MCP_USAGE.md)

Workloom 面向个人与小团队：把资料整理为知识库，用文档记录思路，用数据表管理事项，再通过待办、日历、邮箱和 OA 跟进日常工作。内容保存在自己的实例中，团队成员按账号权限访问；外部 AI 和脚本也可以通过 MCP 与 CLI 使用已授权的资料。

## 从资料到日常工作

| 工作环节 | Workloom 提供的能力 |
| --- | --- |
| 整理知识 | 私人、公共、共享、收藏视图；层级文档、文件夹、路径导航与拖入整理；跨空间复制和移动 |
| 迁入资料 | 批量导入 DOCX、Markdown、TXT，查看处理进度和失败反馈，处理文档图片与附件引用 |
| 编辑与阅读 | TipTap 富文本、图片和附件、Markdown 与图片粘贴、文档内表格排版、大屏标题目录、只读阅读与分享页面 |
| 文档协作 | 分享链接、协作者权限、评论、版本恢复、自动保存、保存队列、冲突左右对比与版本选择 |
| 管理结构化信息 | 字段、模板、公式，表格/看板/日历/甘特视图，按内容调整列宽，CSV 导入与 CSV/XLSX 导出，公开表单 |
| 跟进待办与日程 | 工作台概览、待办、近期文档，月/周/日历、重复日程、待办排期，站内与邮件提醒 |
| 处理邮箱 | IMAP/SMTP 账号绑定、多文件夹同步、站内写信与回复、附件发送、邮件转待办 |
| 沉淀项目上下文 | 线上版项目记忆按项目记录事实、决策与偏好，提供个人、公共、共享项目入口与专用记忆 MCP |
| 组织团队入口 | 邮箱与 Google 登录、邀请码注册、品牌与公司名称设置、OA 侧栏与内嵌页面 |
| 维护内容和实例 | 公共文档回收站、用户与用户组、会话管理、审计、备份恢复、迁移和更新管理 |
| 连接外部工具 | 用户 API Key、远程 MCP、CLI，以用户身份访问文档、数据表、字段与记录 |

## 适合怎样使用

- **个人知识空间**：把零散的文档和笔记批量导入，用文件夹、收藏、目录和搜索组织长期资料。
- **团队共享知识库**：从私人草稿整理到公共内容，配置查看和编辑权限，通过评论、版本记录与冲突选择协作维护。
- **项目与日常办公**：用数据表记录任务和资料，用日历安排时间，从邮箱生成待办，并在同一侧栏进入 OA。
- **AI 工作上下文**：让支持远程 MCP 的客户端读取和更新获授权的资料，或通过 CLI 把文档和数据表接入脚本工作流。

## 使用细节

自己的私人普通文档可以复制到公共知识库，私人文档或目录树可以移到公共空间；管理员可以把公共内容移回自己的私人空间。公共文档及其子树删除后进入回收站，管理员可恢复选中文档及必要父链；私人文档直接删除。

并发编辑通过保存版本检查、冲突对比与版本选择处理，不会自动合并两个版本。文档内表格排版由用户触发，数据表按内容计算列宽是可选开关。OA 页面加载配置的独立系统地址。

当前 Workloom 本地演示界面，使用示例数据。

| 知识库与文件夹 | 富文本编辑与标题目录 |
| --- | --- |
| ![知识库](docs/images/workloom-knowledge.jpg) | ![文档编辑器](docs/images/workloom-editor.jpg) |
| 多视图数据表 | AI 与 CLI 设置 |
| ![数据表](docs/images/workloom-tables.jpg) | ![AI 与 CLI](docs/images/workloom-ai-settings.jpg) |

## 快速部署

需要 Docker Engine、Docker Compose v2，以及用于首次初始化的可用 SMTP 配置。安装器生成 `.env`、随机密钥和私密配置链接，并启动服务。

```bash
curl -fsSL https://raw.githubusercontent.com/bbmy85552/Workloom/main/scripts/install.sh | bash -s -- \
  --repo https://github.com/bbmy85552/Workloom.git \
  --dir workloom \
  --app-url https://workloom.example.com \
  --yes
```

也可以从源码目录安装：

```bash
git clone https://github.com/bbmy85552/Workloom.git
cd Workloom
bash scripts/install.sh
```

在安装目录检查服务，并查看首次配置链接：

```bash
docker compose ps
docker compose logs -f workloom
cat SETUP_URL.txt
```

打开私密配置链接，创建管理员并配置 SMTP 和注册策略。随后可在管理后台配置邀请码、品牌、公司名和 OA 地址。Google 登录通过 `NEXT_PUBLIC_GOOGLE_CLIENT_ID` 配置；开启注册仍需要有效邀请码。

**部署备注：** 线上实例需要登录；线上已展示的项目记忆及专用记忆 MCP 尚未同步到当前公开源码，克隆部署范围以本仓库实现为准。

完整环境变量、反向代理、数据卷和迁移说明见 [配置说明.md](配置说明.md)。

## AI 与命令行接入

在 **设置 → AI 与 CLI** 中生成 API Key。远程 MCP 使用 Streamable HTTP，地址为 `https://你的域名/mcp`，以 `Authorization: Bearer <API Key>` 认证。请使用自己实例的地址和密钥。

```bash
export WORKLOOM_BASE_URL="https://workloom.example.com"
export WORKLOOM_API_KEY="<你的 API Key>"
npm run workloom -- docs list
npm run workloom -- tables list
```

工具、参数和客户端配置见 [MCP_USAGE.md](MCP_USAGE.md)。

## 更新与数据

安装器会把当前仓库、分支和提交写入部署配置。手动部署时设置：

```env
WORKLOOM_UPDATE_REPO=https://github.com/bbmy85552/Workloom.git
WORKLOOM_UPDATE_BRANCH=main
WORKLOOM_UPDATE_CHECK_URL=https://api.github.com/repos/bbmy85552/Workloom/commits/main
```

在部署目录执行更新：

```bash
bash scripts/update.sh
```

低内存服务器可采用宿主机构建的运行时镜像方案：

```bash
bash scripts/update-runtime.sh
```

如果服务器无法获取 GitHub 源码，可在已获取最新代码的电脑上推送更新，`--dir` 填实际部署目录：

```bash
git pull
bash scripts/push-update.sh --host root@example.com --dir /opt/workloom --runtime
```

SQLite 数据库和上传文件分别保存在 `workloom-data`、`workloom-uploads` 持久卷中。更新保留数据与运行配置；单容器重建会有重启窗口。已有实例首次切换部署名称时，应先取得新版脚本，再按 [迁移说明](配置说明.md#已有实例迁移) 核对数据卷并运行更新；旧脚本不会自动获得新版迁移保护。不要更换密钥或删除原卷。

## 本地开发

首次克隆后创建 `server/.env`，编辑本地配置；已有文件会保留。

```bash
cp -n server/.env.example server/.env
npm run setup
npm run dev
```

Web 默认位于 `http://localhost:3000`，API 位于 `http://localhost:4000`。生产 Docker 使用项目根目录 `.env`。

```bash
npm run lint
npm run test
npm run build
```

技术栈为 React、TypeScript、Vite、TipTap、Express、Prisma 和 SQLite。产品说明见 [docs/PRD.md](docs/PRD.md)，维护说明见 [docs/MAINTENANCE.md](docs/MAINTENANCE.md)。

## 来源与许可

Workloom 由 [bbmy85552](https://github.com/bbmy85552) 基于 [Jianji](https://github.com/staklab/jianji) 大幅改进并持续开发。保留原作者版权声明，应用代码采用 [MIT License](LICENSE)；字体许可见 [LICENSES/FONTS.md](LICENSES/FONTS.md)。
