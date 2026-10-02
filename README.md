# Workloom

一个自托管协作工作空间，把知识整理、文档编辑、数据表、日程和邮箱连接起来。

[简体中文](README.md) · [English](README.en.md) · [线上实例](https://company.2dqy.com) · [MCP 与 CLI](MCP_USAGE.md)

Workloom 由 [bbmy85552](https://github.com/bbmy85552) 基于开源项目 [简记 Jianji](https://github.com/staklab/jianji) 持续开发，面向个人资料整理与小团队日常协作。开发内容覆盖知识库组织、批量导入、编辑与排版、协作保存、团队接入、品牌配置、OA 和回收站；MCP/CLI 是其中的外部工具接口。

## Workloom 的开发与扩展

| 领域 | 新增或改进 |
| --- | --- |
| 知识库组织 | 显式文件夹、路径导航、文件夹网格与拖入整理；自己的私人普通文档可复制到公共知识库，私人文档或目录树可移到公共空间，管理员可把公共内容移回自己的私人空间 |
| 批量导入与文件处理 | 批量 DOCX、Markdown、TXT 导入，逐个处理并展示进度与失败反馈；改善导入图片的附件保存、引用处理，以及 DOCX 导出的图片与表格兼容性 |
| 阅读与编辑 | 大屏标题目录和锚点导航、剪贴板图片粘贴、Markdown 粘贴转富文本，以及只读文档和分享页的阅读改进 |
| 表格与表单 | 文档内表格的一键自动排版、数据表按内容计算列宽与对齐的可选开关，以及公开表单下拉选项兼容修复 |
| 协作保存 | 保存版本校验、冲突左右对比与版本选择、保存请求排队；减少连续保存的误报冲突，并让分享链接在登录后返回原位置 |
| 团队接入与品牌 | Google 登录、邀请码注册；品牌与公司名称应用到界面、登录注册页面及系统邮件 |
| OA 接入 | 可配置的侧栏入口，将独立 OA 系统内嵌到工作空间，也支持新窗口打开 |
| 公共文档回收站 | 公共文档及子树软删除，管理员可恢复选中文档及必要父链、永久清理；私人文档仍直接删除 |
| 外部工具 | 用户 API Key、远程 MCP、CLI 和独立设置页，沿用账号权限访问文档与数据表 |

这些扩展建立在上游已有的文档、数据表、日历、邮箱和管理后台等基础模块之上。协作保存通过冲突检测与版本选择处理并发编辑，不提供自动合并；OA 接入是独立系统的嵌入入口。

## 工作空间的完整能力

| 模块 | 能力 |
| --- | --- |
| 文档中心 | 私人、公共、共享、收藏视图，层级文档与文件夹，TipTap 富文本，附件，导入导出，评论，分享和版本恢复 |
| 数据表 | 字段与模板，表格、看板、日历、甘特视图，公式字段，CSV 导入，CSV/XLSX 导出，公开表单 |
| 工作台与日历 | 待办、近期文档、日程概览，月/周/日视图，重复日程、站内与邮件提醒 |
| 邮箱 | IMAP/SMTP 绑定，多文件夹同步，站内写信与附件发送，邮件转待办 |
| 团队管理 | 用户、用户组、会话管理、注册策略、Google 登录、品牌、OA、公共文档回收站 |
| 自托管 | React、Express、TipTap、SQLite，Docker Compose 部署，备份恢复和迁移 |

## 线上实例与仓库版本

[线上实例](https://company.2dqy.com)需要登录，资料访问遵循账号权限。线上还展示了“项目记忆”：按项目沉淀事实、决策与偏好，提供个人、公共和共享项目入口以及专用记忆 MCP。**当前公开仓库尚未包含该模块**；部署此仓库可获得的 MCP 工具以 [MCP_USAGE.md](MCP_USAGE.md) 中的文档与数据表工具为准。

## 基础模块预览

以下四张图片沿用上游截图，用于展示基础模块；Workloom 的扩展功能以上文说明及当前源码为准。

<table>
  <tr>
    <td><img src="docs/images/screenshot-dashboard.png" width="420" alt="工作台" /></td>
    <td><img src="docs/images/screenshot-doc-editor.png" width="420" alt="文档编辑器" /></td>
  </tr>
  <tr>
    <td align="center">工作台</td>
    <td align="center">文档编辑器</td>
  </tr>
  <tr>
    <td><img src="docs/images/screenshot-mail.png" width="420" alt="邮箱聚合" /></td>
    <td><img src="docs/images/screenshot-admin-settings.png" width="420" alt="管理后台系统设置" /></td>
  </tr>
  <tr>
    <td align="center">邮箱聚合</td>
    <td align="center">管理后台</td>
  </tr>
</table>

## 快速部署

推荐在服务器上使用 Docker Compose，并准备可用的 SMTP 配置以完成首次初始化。安装脚本会生成 `.env`、强随机 `JWT_SECRET`、私密首次配置链接，并启动容器。管理员账号、SMTP、注册策略等内容会在浏览器初始化向导中配置。

```bash
curl -fsSL https://raw.githubusercontent.com/bbmy85552/Workloom/main/scripts/install.sh | bash -s -- \
  --repo https://github.com/bbmy85552/Workloom.git \
  --dir Workloom \
  --app-url https://workloom.example.com \
  --yes
```

命令中的 `--repo` 明确指定 Workloom；安装脚本的兼容默认值仍指向上游，请保留此参数。

也可以先克隆仓库：

```bash
git clone https://github.com/bbmy85552/Workloom.git
cd Workloom
bash scripts/install.sh
```

安装完成后查看状态和首次配置链接：

```bash
docker compose ps
docker compose logs -f jianji
cat ./SETUP_URL.txt
```

更多环境变量、SMTP、Nginx、证书和迁移说明见 [配置说明.md](配置说明.md)。

## 更新模型

Workloom 使用 GitHub 分支提交检查更新。通过上述克隆/安装命令部署后，安装脚本会根据当前 `origin` 和分支写入更新源及当前 commit。手动部署时，请在 `.env` 中明确配置 Workloom 的更新源，避免使用兼容配置中保留的上游默认值：

```env
JIANJI_UPDATE_REPO=https://github.com/bbmy85552/Workloom.git
JIANJI_UPDATE_BRANCH=main
JIANJI_UPDATE_CHECK_URL=https://api.github.com/repos/bbmy85552/Workloom/commits/main
```

服务器无损更新：

```bash
bash scripts/update.sh
```

低内存服务器可使用宿主机构建、运行时镜像方式：

```bash
bash scripts/update-runtime.sh
```

更新脚本会备份 `.env` 和 `SETUP_URL.txt`，保留 SQLite 与上传文件 Docker 卷，拉取最新代码，重建容器，并等待服务健康检查通过。若部署目录不是 Git checkout，脚本会从 `JIANJI_UPDATE_REPO` / `JIANJI_UPDATE_BRANCH` 指向的 GitHub 分支归档刷新源码，同时继续保护运行时配置与数据。单容器部署会有极短重启窗口；如果需要严格零中断，可以在 Nginx 前做蓝绿发布。

如果你的部署环境无法稳定访问 GitHub 的仓库接口或源码归档地址，服务器端自动拉取更新将不可用。可以在一台能获取最新源码的本地电脑上执行推送式更新：

```bash
git pull
bash scripts/push-update.sh --host root@example.com --dir /opt/jianji --runtime
```

推送式更新会通过 SSH/rsync 同步源码，并让服务器跳过远端拉取步骤，直接执行无损重建；服务器上的 `.env`、初始化链接、证书、数据库、上传文件和备份目录不会被覆盖。

## AI 与命令行接入

在“设置 → AI 与 CLI”中生成用户 API Key。远程 MCP 使用 Streamable HTTP，端点是 `https://你的域名/mcp`，通过 `Authorization: Bearer <API Key>` 认证。当前设置页的示例地址指向线上实例；自托管时请换成自己的实例域名。

CLI 使用现有命令与环境变量名：

```bash
export DOCS_PLATFORM_BASE_URL="https://workloom.example.com"
export DOCS_PLATFORM_API_KEY="<你的 API Key>"
npm run docs-platform -- docs list
npm run docs-platform -- tables list
```

详细工具、参数和客户端配置见 [MCP_USAGE.md](MCP_USAGE.md)。Google 登录通过 `NEXT_PUBLIC_GOOGLE_CLIENT_ID` 配置；邀请码、品牌和 OA 地址在管理后台设置。新用户注册需要有效邀请码；允许注册的开关不会免除邀请码校验。

## 本地开发

首次克隆后先创建 `server/.env`，按需编辑配置再安装依赖；如果已有配置，请保留原文件。

```bash
cp -n server/.env.example server/.env
npm run setup
npm run dev
```

默认开发地址：

| 服务 | 地址 |
| --- | --- |
| Web | `http://localhost:3000` |
| API | `http://localhost:4000` |

## 测试与构建

```bash
npm run lint
npm run test
npm run build
```

## 数据与安全

为兼容现有部署，服务名 `jianji`、`jianji:*` 镜像名、`JIANJI_*` 配置名及下列数据卷名保持不变。已有实例继续使用原部署目录和 Compose 项目名，避免连接到新的空卷。

Docker 部署使用两个持久化卷：

| 卷 | 内容 |
| --- | --- |
| `jianji-data` | SQLite 数据库，挂载到 `/app/data` |
| `jianji-uploads` | 头像、附件等上传文件，挂载到 `/app/uploads` |

仓库和 Docker 构建上下文默认排除 `.env`、`SETUP_URL.txt`、SQLite 数据库、上传目录、证书、密钥和本地缓存。迁移包可能包含加密后的邮箱凭据和用户上传文件，请按私密备份保存。

## License

Workloom 在 [staklab/jianji](https://github.com/staklab/jianji) 的基础上开发，保留原作者署名，应用代码继续采用 [MIT License](LICENSE)。内置字体遵循各自 OFL 许可，见 [LICENSES/FONTS.md](LICENSES/FONTS.md)。
