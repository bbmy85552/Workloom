# Workloom 发布与维护

代码仓库：[bbmy85552/Workloom](https://github.com/bbmy85552/Workloom)。本指南适用于当前版本的发布准备、数据兼容和文档维护。

## 发布前验证

根据实际改动运行相关检查；发布包含应用或部署逻辑时，验证类型、测试、构建和脚本语法：

```bash
npm run lint
npm run test
npm run build
bash -n scripts/install.sh scripts/update.sh scripts/update-runtime.sh scripts/push-update.sh
```

检查工作区，确认发布只包含预期代码、文档与素材：

```bash
git status --short --untracked-files=all
git diff --check
```

`.env`、初始化链接、SQLite 数据库、上传内容、依赖目录、构建产物、证书和密钥不应进入提交。公开截图需使用适合展示的测试内容，避免暴露真实团队资料和访问凭据。

## 文档与版本

- 同步中英文 README、产品说明、MCP/CLI 工具说明和配置模板。
- 使用 Workloom 当前版本的截图与名称，核对安装命令、仓库地址和设置入口。
- 版本说明写清具体功能、修复、迁移要求和验证结果。
- 对线上实例与公开源码尚未同步的部分保留简短部署备注，避免承诺源码中不存在的功能。
- 版本标签按实际发布计划命名，不重复创建已存在的标签。

## 部署与数据兼容

新部署使用 `workloom` 服务和 `workloom:latest` 镜像，运行时构建使用 `workloom:runtime`。持久化数据卷为 `workloom-data` 和 `workloom-uploads`，可通过 `WORKLOOM_DATA_VOLUME`、`WORKLOOM_UPLOADS_VOLUME` 指定实际物理卷名。

部署变更应验证新安装和已有实例更新。已有实例保留原数据库、上传卷、JWT 密钥及必要配置，原地更新前核对备份与卷映射；具体迁移步骤见 [配置说明](../配置说明.md#已有实例迁移)。更新失败不能以删除旧数据或重新初始化代替恢复。

验证范围包括数据库迁移、健康检查、登录与会话、附件访问和必要的回退路径。后端兼容的历史标识不应因展示名称调整而失效。

## 日常维护

定期备份数据库和上传文件，保留可恢复的配置记录。数据库中的邮箱凭据依赖 `JWT_SECRET` 解密，不能随意更换该值。API Key 可由用户撤销和重建，文档或截图不应包含真实 key。

后台更新功能使用 `WORKLOOM_UPDATE_CHECK_URL` 检查版本，使用配置的更新命令执行更新。命令是否可用取决于部署环境的文件路径、依赖和权限，应在对应环境验证。

## Release checklist in English

- Run the checks relevant to the change; application and deployment releases include types, tests, builds and shell syntax validation.
- Keep Chinese and English product documentation, configuration examples and MCP/CLI instructions aligned with the implementation.
- Use current Workloom screenshots with publishable content. Keep deployment-only functionality clearly identified when its source is not yet synchronized.
- Verify both new installations and existing-instance upgrades, including database and upload volumes, credentials, health checks and recovery.
- Preserve secrets, user data and legacy-format compatibility. Never replace a failed migration with a fresh empty instance.
- Write release notes with concrete behavior, migration requirements and verification results.

## 来源与许可

Workloom 基于 [Jianji](https://github.com/staklab/jianji) 大幅改进并持续开发，保留原作者版权声明，应用代码采用 [MIT License](../LICENSE)。
