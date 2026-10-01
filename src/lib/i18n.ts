import type { UserPreferences } from './types';

export type LanguagePreference = UserPreferences['language'];

const LANGUAGE_KEY = 'jianji.language';

const exactEn: Record<string, string> = {
  简记: 'Document Center',
  文档中心: 'Workspace',
  工作台: 'Dashboard',
  知识库: 'Docs',
  数据表: 'Tables',
  日历: 'Calendar',
  邮箱: 'Mail',
  最近: 'Recent',
  OA: 'OA',
  设置: 'Settings',
  帮助: 'Help',
  管理后台: 'Admin',
  用户管理: 'Users',
  用户组: 'Groups',
  系统设置: 'System Settings',
  审计日志: 'Audit Logs',
  登录为: 'Logged in as',
  返回工作台: 'Back to Dashboard',
  返回登录页: 'Back to Login',
  退出: 'Sign Out',
  退出登录: 'Sign Out',
  新建文档: 'New Document',
  加载中: 'Loading',
  '加载中…': 'Loading...',
  '载入中…': 'Loading...',
  刷新: 'Refresh',
  保存: 'Save',
  取消: 'Cancel',
  确定: 'OK',
  确认: 'Confirm',
  简体中文: 'Simplified Chinese',
  删除: 'Delete',
  添加: 'Add',
  新增: 'New',
  创建: 'Create',
  编辑: 'Edit',
  重命名: 'Rename',
  关闭: 'Close',
  发送: 'Send',
  复制: 'Copy',
  下载: 'Download',
  上传: 'Upload',
  导出: 'Export',
  导入: 'Import',
  分享: 'Share',
  历史: 'History',
  评论: 'Comments',
  搜索: 'Search',
  详情: 'Details',
  返回: 'Back',
  撤销: 'Undo',
  重做: 'Redo',
  提示: 'Notice',
  危险操作: 'Dangerous Action',
  请确认: 'Please Confirm',
  请输入: 'Please Enter',
  共: 'Total',
  人: 'users',
  '人 · 第': 'users · Page',
  条: 'logs',
  '条 · 第': 'logs · Page',
  第: 'Page',
  页: '',
  请稍候: 'Please wait',
  '请稍候…': 'Please wait...',
  我知道了: 'Got it',
  新建: 'New',
  已复制到剪贴板: 'Copied to clipboard',
  '复制失败,请手动选择文本复制': 'Copy failed. Please select the text manually.',
  请妥善保存上述信息: 'Please keep the information above safe',
  '请妥善保存上述信息,关闭后将无法再次查看。':
    'Please keep the information above safe. It cannot be viewed again after closing.',
  检查系统状态: 'Checking system status',
  '检查系统状态…': 'Checking system status...',
  '无法连接服务器，请确认后端服务已启动。':
    'Cannot connect to the server. Please confirm the backend service is running.',

  // Settings
  个人资料: 'Profile',
  密码与邮箱: 'Password & Email',
  'AI 与 CLI': 'AI & CLI',
  偏好设置: 'Preferences',
  字体管理: 'Font Management',
  账号安全相关设置: 'Account security settings',
  '为 AI 客户端、MCP 和命令行创建访问凭证。':
    'Create access credentials for AI clients, MCP, and command line tools.',
  '每个用户只有一个 API Key。重建后旧 Key 会立即失效，明文只显示这一次。':
    'Each user has one API Key. Regenerating it immediately invalidates the old key, and the plaintext is shown only once.',
  '当前 Key': 'Current Key',
  最近使用: 'Last Used',
  从未使用: 'Never used',
  '还没有 API Key。': 'No API Key yet.',
  '新 API Key': 'New API Key',
  '请立即保存。关闭或刷新页面后将无法再次查看明文。':
    'Save it now. After closing or refreshing this page, the plaintext cannot be viewed again.',
  '复制 API Key': 'Copy API Key',
  '生成 API Key': 'Generate API Key',
  '重建 API Key': 'Regenerate API Key',
  '删除 API Key': 'Delete API Key',
  '重建后旧 API Key 会立即失效，继续吗？':
    'Regenerating will immediately invalidate the old API Key. Continue?',
  '确认删除当前 API Key？删除后 CLI 和 AI 工具将无法访问。':
    'Delete the current API Key? CLI and AI tools will no longer be able to access your account.',
  '新的 API Key 已生成，请立即保存': 'New API Key generated. Save it now.',
  'API Key 已删除': 'API Key deleted',
  '远程 MCP': 'Remote MCP',
  '支持远程 MCP 的客户端可以直接连接 docs-platform，不需要下载源码。':
    'Clients that support remote MCP can connect directly to docs-platform without downloading the source code.',
  'MCP 地址': 'MCP URL',
  客户端配置示例: 'Client Configuration Example',
  '测试 tools/list': 'Test tools/list',
  '本地 CLI': 'Local CLI',
  'CLI 主要用于开发和排查。AI 客户端优先使用远程 MCP 地址。':
    'The CLI is mainly for development and troubleshooting. AI clients should prefer the remote MCP URL.',
  环境变量与命令: 'Environment Variables and Commands',
  'API Key 会以当前用户身份访问文档和数据表。不要把 API Key 写入公开仓库、截图或共享文档。':
    'The API Key accesses documents and tables as the current user. Do not put it in public repositories, screenshots, or shared documents.',
  最近重建: 'Last Regenerated',
  修改密码: 'Change Password',
  当前密码: 'Current Password',
  新密码: 'New Password',
  更新密码: 'Update Password',
  '更新中…': 'Updating...',
  验证或绑定邮箱: 'Verify or Bind Email',
  更换邮箱: 'Change Email',
  当前绑定: 'Current Email',
  '当前绑定：': 'Current email: ',
  替换为: 'Replace With',
  验证码: 'Verification Code',
  获取验证码: 'Get Code',
  '发送中…': 'Sending...',
  验证邮箱: 'Verify Email',
  站内通知: 'In-app Notifications',
  邮件提醒: 'Email Notifications',
  邮件通知: 'Email Notifications',
  登录设备: 'Login Devices',
  注销其他设备: 'Sign Out Other Devices',
  注销设备: 'Sign Out Device',
  注销该设备: 'Sign out this device',
  注销: 'Sign Out',
  全部注销: 'Sign Out All',
  当前设备: 'Current Device',
  已注销: 'Signed Out',
  已过期: 'Expired',
  未知设备: 'Unknown Device',
  浏览器: 'Browser',
  刚刚: 'Just now',
  没有登录记录: 'No login records',
  '登录过的设备会留痕；注销设备会让对应会话立即失效，但不会保存或展示任何密码。':
    'Previously used devices are recorded. Signing out a device invalidates that session immediately and never stores or displays passwords.',
  这些设置仅影响当前账号的体验: 'These settings only affect your account experience',
  '这些设置仅影响当前账号的体验，立即生效，无需重启。':
    'These settings only affect your account experience and take effect immediately.',
  修改后会自动保存: 'Changes are saved automatically',
  '修改后会自动保存，无需手动点击保存。':
    'Changes are saved automatically. No manual save is needed.',
  '正在自动保存…': 'Saving automatically...',
  所有偏好已自动保存: 'All preferences saved',
  自动保存失败: 'Auto-save failed',
  '自动保存失败，请稍后重试': 'Auto-save failed. Please try again later.',
  '偏好已自动保存': 'Preferences saved',
  外观: 'Appearance',
  主题: 'Theme',
  跟随系统: 'System',
  浅色: 'Light',
  深色: 'Dark',
  '深色（实验）': 'Dark',
  界面语言: 'Interface Language',
  主题色: 'Theme Color',
  恢复默认: 'Reset',
  选择自定义主题色: 'Choose custom theme color',
  '当前颜色会用于按钮、选中态、链接和焦点高亮。':
    'The current color is used for buttons, selected states, links, and focus highlights.',
  默认: 'Defaults',
  登录后默认进入: 'Default Home After Login',
  编辑器: 'Editor',
  默认字体: 'Default Font',
  默认字号: 'Default Font Size',
  留空使用系统字体: 'Leave blank to use the system font',
  通知: 'Notifications',
  邮箱同步: 'Mail Sync',
  每页邮件数: 'Messages Per Page',
  每次同步数量: 'Sync Limit',
  提前提醒: 'Reminder',
  '管理你的账户、安全与个性化偏好。':
    'Manage your account, security, and personalization preferences.',
  '日历提醒、表单提交、邀请等会推送到顶部的通知中心。':
    'Calendar reminders, form submissions, and invitations are pushed to the top notification center.',
  '重要提醒同步发送到我的注册邮箱（需服务器配置 SMTP）。':
    'Important reminders are also sent to my registered email. SMTP must be configured on the server.',

  // Admin
  管理员可调整应用全局策略: 'Administrators can adjust global app policies',
  用户数: 'Users',
  文档数: 'Documents',
  表格数: 'Tables',
  附件占用: 'Attachment Usage',
  '查看、调整角色、重置密码、禁用账号': 'View users, adjust roles, reset passwords, and disable accounts',
  姓名: 'Name',
  最近登录: 'Last Login',
  重置: 'Reset',
  没有匹配的用户: 'No matching users',
  按邮箱或姓名搜索: 'Search by email or name',
  初始密码: 'Initial Password',
  '初始密码（留空将自动生成）': 'Initial Password (leave blank to generate automatically)',
  '至少 8 位': 'At least 8 characters',
  品牌名称: 'Brand Name',
  登录页与顶部导航显示的名称: 'Name shown on the login page and top navigation',
  公司名: 'Company Name',
  显示在侧边栏品牌名称下方: 'Shown below the brand name in the sidebar',
  注册邀请码: 'Registration Invite Code',
  新用户必须填写正确邀请码才能注册: 'New users must enter the correct invite code to register',
  设置后发给需要注册的成员: 'Share this with members who need to register',
  'OA 地址': 'OA URL',
  '侧边栏 OA 页面 iframe 加载的 URL': 'URL loaded in the sidebar OA iframe page',
  新窗口打开: 'Open in New Window',
  邀请码: 'Invite Code',
  请输入管理员提供的邀请码: 'Enter the invite code from your administrator',
  默认工作区名称: 'Default Workspace Name',
  新用户注册或被创建时自动生成的工作区名:
    'Workspace name generated for new users',
  单文件最大体积: 'Maximum File Size',
  '单文件最大体积 (MB)': 'Maximum File Size (MB)',
  是否允许公开注册: 'Allow Public Registration',
  '影响上传接口的拒绝阈值（仅作记录，实际限制需重启后生效）':
    'Rejection threshold for uploads. This is recorded here and takes effect after restart.',
  关闭后注册接口将拒绝新用户: 'When disabled, registration endpoints reject new users',
  允许: 'Allow',
  禁止: 'Disable',
  发送测试邮件: 'Send Test Email',
  '通过网页初始化保存的 SMTP 配置向指定地址发送测试邮件；若未初始化 SMTP，则回退读取服务器环境变量配置。':
    'Send a test email to the specified address using SMTP settings saved during web setup. If SMTP was not initialized, server environment variables are used as fallback.',
  收件人邮箱: 'Recipient Email',
  邮件主题: 'Email Subject',
  版本更新: 'Version Update',
  '管理员确认更新后，会先向右上角消息中心和用户注册邮箱发送维护通知。服务器未配置自动更新命令时，可按 README 的备用方案执行无损更新脚本。':
    'After an administrator confirms an update, maintenance notices are sent to the top-right message center and user registration emails. If no auto-update command is configured, follow the README fallback plan for a lossless update.',
  检查更新: 'Check Updates',
  通知并更新: 'Notify and Update',
  发送完成通知: 'Send Completion Notice',
  处理中: 'Processing',
  '处理中…': 'Processing...',
  当前版本: 'Current Version',
  '当前版本：': 'Current version: ',
  最新版本: 'Latest Version',
  '最新版本：': 'Latest version: ',
  '·最新版本：': ' · Latest version: ',
  未知: 'Unknown',
  已配置自动更新命令: 'Auto update command configured',
  未配置自动更新命令: 'Auto update command not configured',
  数据备份与恢复: 'Backup & Restore',
  '数据库备份包含用户、文档、表格、日程、邮件缓存与系统设置；完整迁移包还会包含上传文件和脱敏配置摘要，适合迁移到新服务器。':
    'Database backups include users, documents, tables, calendar events, mail cache, and system settings. Full migration packages also include uploaded files and a sanitized configuration summary for moving to a new server.',
  导出数据库备份: 'Export Database Backup',
  恢复数据库备份: 'Restore Database Backup',
  恢复中: 'Restoring',
  '恢复中…': 'Restoring...',
  导出完整迁移包: 'Export Full Migration Package',
  导入迁移包: 'Import Migration Package',
  导入中: 'Importing',
  '导入中…': 'Importing...',
  '迁移包可能包含加密后的邮箱凭据和附件文件，请只保存在可信位置；明文密钥、AccessKey 和服务器 `.env` 不会写入仓库发布包。':
    'Migration packages may contain encrypted mail credentials and attachment files. Store them only in trusted locations. Plaintext keys, AccessKeys, and the server `.env` are never written into repository release packages.',
  用户: 'User',
  用户名: 'Name',
  角色: 'Role',
  状态: 'Status',
  操作: 'Actions',
  管理员: 'Admin',
  普通用户: 'User',
  正常: 'Active',
  已禁用: 'Disabled',
  新建用户: 'New User',
  添加用户: 'Add User',
  创建用户: 'Create User',
  重置密码: 'Reset Password',
  禁用: 'Disable',
  启用: 'Enable',
  删除用户: 'Delete User',
  新建用户组: 'New Group',
  创建用户组: 'Create Group',
  '将用户分组，便于后续批量分享或权限分配':
    'Group users for future batch sharing or permission assignment',
  还没有创建任何用户组: 'No groups have been created yet',
  组名称: 'Group Name',
  简介: 'Description',
  '简介（可选）': 'Description (optional)',
  '（无简介）': '(No description)',
  删除组: 'Delete Group',
  还没有成员: 'No members yet',
  添加成员: 'Add Member',
  移除成员: 'Remove Member',
  更新用户: 'Update User',
  更新系统设置: 'Update System Settings',
  追踪管理员操作历史: 'Track administrator operation history',
  时间: 'Time',
  操作员: 'Operator',
  动作: 'Action',
  对象: 'Object',
  明细: 'Details',
  暂无日志: 'No audit logs',

  // Dashboard / documents / tables
  欢迎回来: 'Welcome back',
  '欢迎回来，': 'Welcome back, ',
  今天是: 'Today is',
  '今天是 ': 'Today is ',
  '，把重要的事情先完成吧。': ". Let's finish the important things first.",
  简记用户: 'Document Center User',
  '今日还没有待办，添加一项开始吧': 'No todos today. Add one to get started.',
  今日进度: "Today's Progress",
  添加待办: 'Add Todo',
  今日待办: "Today's Todos",
  回到今天: 'Back to Today',
  今日日程: "Today's Events",
  即将到期: 'Due Soon',
  最近文档: 'Recent Documents',
  我的收藏: 'Favorites',
  指定日期的待办: 'Todos for Selected Date',
  查看更多: 'View More',
  今天没有日程: 'No events today',
  '7 天内没有截止待办': 'No todos due in 7 days',
  还没有最近文档: 'No recent documents yet',
  暂无待办: 'No todos',
  未命名: 'Untitled',
  未命名文档: 'Untitled Document',
  文档附件: 'Document Attachments',
  文档评论: 'Document Comments',
  添加评论: 'Add Comment',
  写一条评论: 'Write a comment',
  回复: 'Reply',
  解决: 'Resolve',
  重新打开: 'Reopen',
  返回文档列表: 'Back to Documents',
  所有者: 'Owner',
  可编辑: 'Can edit',
  仅查看: 'View only',
  只读: 'Read only',
  已保存: 'Saved',
  '正在保存…': 'Saving...',
  待保存: 'Unsaved',
  收藏: 'Favorite',
  取消收藏: 'Remove Favorite',
  打印: 'Print',
  '打印 / 另存为 PDF': 'Print / Save as PDF',
  删除文档: 'Delete Document',
  暂无评论: 'No comments yet',
  知识库为空: 'No documents yet',
  新建文件夹: 'New Folder',
  私人空间: 'Private Space',
  公共知识库: 'Public Docs',
  与我共享: 'Shared With Me',
  共享给我: 'Shared With Me',
  收藏夹: 'Favorites',
  网格: 'Grid',
  树形: 'Tree',
  导入文件: 'Import File',
  复制到公共知识库: 'Copy to Public Docs',
  文件夹名称: 'Folder Name',
  文件夹: 'Folder',
  移动到文件夹: 'Move to Folder',
  公共知识库根目录: 'Public Docs Root',
  移动: 'Move',
  我的知识库: 'My Docs',
  我的私人知识库: 'My Private Docs',
  仅自己可见: 'Only visible to you',
  '私人空间用于个人沉淀；公共知识库面向所有注册用户。':
    'Private space is for your own notes. Public docs are visible to all registered users.',
  '私人知识库还没有内容，点击新建或导入开始记录':
    'Your private docs are empty. Create or import something to get started.',
  '所有注册用户可查看，你将成为文档所有者':
    'All registered users can view it. You will become the document owner.',

  记录: 'Records',
  字段: 'Fields',
  当前视图: 'Current View',
  填写率: 'Fill Rate',
  完成项: 'Completed',
  平均进度: 'Average Progress',
  新增记录: 'New Record',
  新增字段: 'New Field',
  表格: 'Table',
  看板: 'Kanban',
  甘特: 'Gantt',
  表单视图: 'Form Views',
  返回数据表列表: 'Back to Tables',
  删除数据表: 'Delete Table',
  重命名数据表: 'Rename Table',
  删除字段: 'Delete Field',
  删除记录: 'Delete Record',
  复制记录: 'Duplicate Record',
  字段名称: 'Field Name',
  文本: 'Text',
  长文本: 'Long Text',
  数字: 'Number',
  日期: 'Date',
  日期时间: 'Date Time',
  单选: 'Single Select',
  多选: 'Multi Select',
  复选: 'Checkbox',
  电话: 'Phone',
  评分: 'Rating',
  进度: 'Progress',
  人员: 'People',
  附件: 'Attachment',
  公式: 'Formula',
  '公式（计算字段）': 'Formula (calculated)',
  反馈收集: 'Feedback Form',
  创建新表单: 'Create Form',
  暂未创建任何表单: 'No forms yet',
  复制链接: 'Copy Link',
  关闭收集: 'Close Collection',
  重新开启: 'Reopen',
  创建表单: 'Create Form',
  表单标题: 'Form Title',
  描述: 'Description',
  '描述（可选）': 'Description (optional)',
  必填: 'Required',
  未分类: 'Uncategorized',
  拖动卡片到此分组: 'Drag cards here',
  '暂无记录，点击「新增记录」开始录入。': 'No records yet. Click "New Record" to start.',
  '看板视图需要表格中至少有一个「单选」字段作为分组依据。':
    'Kanban view needs at least one single-select field for grouping.',
  '请在「新增字段」中创建一个单选字段（例如「状态」）。':
    'Create a single-select field in "New Field", for example "Status".',
  '日历视图需要表格中至少有一个「日期」或「日期时间」字段。':
    'Calendar view needs at least one date or date-time field.',
  '还没有数据表，点击右上角从模板创建一个吧。':
    'No tables yet. Create one from a template in the top right.',
  '用结构化的方式管理任务、客户、Bug 与日常记录。':
    'Manage tasks, customers, bugs, and daily records in a structured way.',
  我的数据表: 'My Tables',
  '导入 CSV': 'Import CSV',
  新建数据表: 'New Table',
  本月: 'This Month',
  升序: 'Ascending',
  降序: 'Descending',
  按字段筛选: 'Filter by field',
  '按字段筛选…': 'Filter by field...',
  按字段排序: 'Sort by field',
  '按字段排序…': 'Sort by field...',
  包含: 'Contains',
  '包含…': 'Contains...',

  // Calendar
  点击日期查看安排: 'Click a date to view schedule',
  '点击日期查看安排，或新建一个日程': 'Click a date to view schedule, or create an event',
  月: 'Month',
  周: 'Week',
  日: 'Day',
  今天: 'Today',
  新建日程: 'New Event',
  编辑日程: 'Edit Event',
  删除日程: 'Delete Event',
  保存会更新整个重复日程: 'Saving will update the whole recurring event',
  '保存会更新整个重复日程。': 'Saving will update the whole recurring event.',
  标题: 'Title',
  开始: 'Start',
  结束: 'End',
  全天: 'All Day',
  颜色: 'Color',
  重复规则: 'Repeat Rule',
  不重复: 'No repeat',
  每天: 'Daily',
  每周: 'Weekly',
  每月: 'Monthly',
  每天重复: 'Repeats daily',
  每周重复: 'Repeats weekly',
  每月重复: 'Repeats monthly',
  地点: 'Location',
  备注: 'Notes',
  所选日期: 'Selected Date',
  这一天没有安排: 'No events for this day',
  待办排入日历: 'Schedule Todos',
  暂无可安排待办: 'No schedulable todos',
  一: 'Mon',
  二: 'Tue',
  三: 'Wed',
  四: 'Thu',
  五: 'Fri',
  六: 'Sat',

  // Mail
  写邮件: 'Compose',
  收件箱: 'Inbox',
  已发送: 'Sent',
  草稿: 'Drafts',
  垃圾箱: 'Trash',
  账号设置: 'Account Settings',
  邮箱账号: 'Mail Accounts',
  添加邮箱账号: 'Add Mail Account',
  发件人: 'From',
  收件人: 'To',
  抄送: 'Cc',
  正文: 'Body',
  添加附件: 'Add Attachment',
  回信: 'Reply',
  同步: 'Sync',
  同步中: 'Syncing',
  暂无邮件: 'No messages',
  显示: 'Show',
  封: 'messages',
  '聚合多个邮箱账号，统一收发邮件': 'Aggregate multiple mail accounts and send or receive mail in one place',
  一键绑定: 'Quick Bind',
  高级配置: 'Advanced Settings',
  邮箱设置: 'Mail Settings',
  已绑定账号: 'Bound Accounts',
  暂无邮箱: 'No mail accounts',
  请先绑定一个邮箱: 'Please bind a mail account first',
  一封邮件查看: 'a message to view',
  一键绑定邮箱: 'Quick Bind Mail Account',
  邮箱设置已保存: 'Mail settings saved',

  // Auth / setup
  登录: 'Log In',
  注册: 'Register',
  找回密码: 'Reset Password',
  返回登录: 'Back to Login',
  记住邮箱: 'Remember Email',
  记住密码: 'Remember Password',
  '记住邮箱（不会保存密码）': 'Remember email (password will not be saved)',
  密码: 'Password',
  确认密码: 'Confirm Password',
  显示名称: 'Display Name',
  管理员邮箱: 'Admin Email',
  管理员密码: 'Admin Password',
  首次配置简记: 'First-time Document Center Setup',
  需要初始化密钥: 'Setup Token Required',
  正在检查初始化状态: 'Checking setup status',
  '正在检查初始化状态…': 'Checking setup status...',
  完成配置: 'Complete Setup',
  页面走丢了: 'Page not found.',
  '页面走丢了。': 'Page not found.',
  '登录简记，开始你的工作': 'Log in to the document center and start your work',
  '登录简记，开始你的工作。': 'Log in to the document center and start your work.',
  还没有账号: 'No account yet',
  '还没有账号？': 'No account yet?',
  忘记密码: 'Forgot password',
  注册邮箱: 'Registered Email',
  邮箱验证码: 'Email Verification Code',
  通过邮箱验证码重新设置密码: 'Reset your password with an email verification code',
  '请先填写邮箱': 'Please enter your email first',
  '如该邮箱已注册，我们已发送验证码（10 分钟内有效）':
    'If this email is registered, a verification code has been sent. It is valid for 10 minutes.',

  // Editor
  插入链接: 'Insert Link',
  段落样式: 'Paragraph Style',
  标题1: 'Heading 1',
  '标题 1': 'Heading 1',
  '标题 2': 'Heading 2',
  '标题 3': 'Heading 3',
  字体: 'Font',
  字号: 'Font Size',
  加粗: 'Bold',
  斜体: 'Italic',
  下划线: 'Underline',
  删除线: 'Strikethrough',
  上标: 'Superscript',
  下标: 'Subscript',
  字体颜色: 'Text Color',
  清除颜色: 'Clear Color',
  背景高亮: 'Highlight',
  清除高亮: 'Clear Highlight',
  左对齐: 'Align Left',
  居中: 'Center',
  右对齐: 'Align Right',
  两端对齐: 'Justify',
  行高: 'Line Height',
  无序列表: 'Bullet List',
  有序列表: 'Numbered List',
  任务列表: 'Task List',
  引用: 'Quote',
  代码块: 'Code Block',
  链接: 'Link',
  插入图片: 'Insert Image',
  插入附件: 'Insert Attachment',
  查找替换: 'Find & Replace',
  查找与替换: 'Find & Replace',
  查找: 'Find',
  替换: 'Replace',
  区分大小写: 'Match Case',
  全部替换: 'Replace All',
  未找到匹配: 'No matches',
  输入关键词开始查找: 'Enter a keyword to search',

  // Time / misc
  全部: 'All',
  文档: 'Document',
  数据表项目: 'Table',
  日程: 'Event',
  活跃: 'Active',
  已完成: 'Completed',
  进行中: 'In Progress',
  待开始: 'Not Started',
  是: 'Yes',
  否: 'No',
  无: 'None',
  '长度 8-64 位': '8-64 characters',
  '（已验证）': '(verified)',
  '（待验证，可在下方输入当前邮箱完成验证）':
    '(pending verification; enter the current email below to complete verification)',
  最近活跃: 'Last active',
  靛蓝: 'Indigo',
  蓝色: 'Blue',
  青色: 'Cyan',
  绿色: 'Green',
  琥珀: 'Amber',
  玫红: 'Rose',
  紫色: 'Purple',
  石墨: 'Graphite',
  暂无最近活动: 'No recent activity',
  '汇总你近期编辑或查看过的文档、表格与日程。':
    'A summary of documents, tables, and events you recently edited or viewed.',
  '来自分享': 'Shared link',
  加入协作: 'Join Collaboration',
  已加入协作: 'Joined collaboration',
  无法打开分享内容: 'Cannot open shared content',
  '简记 · 公开表单': 'Document Center · Public Form',
  由表单创建者邀请你填写: 'Invited by the form creator',
  '提交成功，感谢你的反馈': 'Submitted successfully. Thank you for your feedback',
  '提交成功，感谢你的反馈！': 'Submitted successfully. Thank you for your feedback!',
  再提交一份: 'Submit Another',
  提交中: 'Submitting',
  '提交中…': 'Submitting...',
  提交: 'Submit',
  请选择: 'Please select',
  '表单数据将存入对应的数据表，仅创建者可查看。':
    'Form data will be stored in the corresponding table and visible only to the creator.',
  个人文档中心: 'Personal Workspace',
  '管理内置字体许可证和你导入的字体': 'Manage built-in font licenses and imported fonts',
  '内置字体（开源）': 'Built-in Fonts (Open Source)',
  '正文与界面默认无衬线字体': 'Default sans-serif font for body text and UI',
  '标题与展示型衬线字体': 'Serif font for headings and display text',
  许可证: 'License',
  '许可证：': 'License: ',
  '· 许可证：': '· License: ',
  查看许可: 'View License',
  我导入的字体: 'My Imported Fonts',
  '还没有导入字体。导入仅会记录字体名与来源，不会上传字体文件。':
    'No imported fonts yet. Importing only records the font name and source; font files are not uploaded.',
  导入新字体: 'Import New Font',
  '字体家族名 (font-family)': 'Font Family (font-family)',
  '例如 Inter, Noto Sans SC': 'For example, Inter or Noto Sans SC',
  字体来源: 'Font Source',
  '官网链接、字体文件 URL 或开源仓库地址': 'Official site, font file URL, or open-source repository URL',
  '我已确认拥有该字体在当前使用场景下的合法授权，且不会与当前部署的使用要求冲突。':
    'I confirm I have the legal right to use this font in the current scenario and that it does not conflict with this deployment.',
  添加字体: 'Add Font',
  保存中: 'Saving',
  '保存中…': 'Saving...',
  保存修改: 'Save Changes',
  历史头像: 'Avatar History',
  回收站: 'Trash',
  '公共知识库中被删除的文档，保留 30 天后自动清理':
    'Deleted documents from the public workspace are retained for 30 days before automatic cleanup.',
  删除人: 'Deleted By',
  删除时间: 'Deleted At',
  剩余保留: 'Retained For',
  恢复: 'Restore',
  彻底删除: 'Purge',
  回收站为空: 'Trash is empty',
  '恢复到原位置': 'restore to its original location',
  '彻底删除（不可恢复）': 'Permanently delete (irreversible)',
  '已彻底删除': 'Permanently deleted',
  '已恢复到原位置': 'Restored to its original location',
  '确认恢复文档': 'Restore document',
  '将还原到其原位置。': 'It will be restored to its original location.',
  '确认彻底删除': 'Confirm permanent deletion',
  恢复文档: 'Restore document',
  '彻底删除文档': 'Purge document',
  '移动到公共知识库': 'Move to Public Workspace',
  '已移动到公共知识库': 'Moved to public workspace',
  '已复制到公共知识库': 'Copied to public workspace',
  '移到我的私密空间': 'Move to My Private Space',
  '转为私密': 'Make Private',
  '已移到我的私密空间': 'Moved to my private space',
};

const textPatterns: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [/^(\d+)s 后重试$/, (m) => `Retry in ${m[1]}s`],
  [/^欢迎回来，(.+)$/, (m) => `Welcome back, ${m[1]}`],
  [/^今天是 (.+)，把重要的事情先完成吧。$/, (m) => `Today is ${m[1]}. Let's finish the important things first.`],
  [/^(.+) 已完成$/, (m) => `${m[1]} completed`],
  [/^(\d+) \/ (\d+) 已完成$/, (m) => `${m[1]} / ${m[2]} completed`],
  [/^显示 (\d+) 封$/, (m) => `Show ${m[1]} messages`],
  [/^(.+) · (\d+) 封$/, (m) => `${m[1]} · ${m[2]} messages`],
  [/^文件：(.+)$/, (m) => `File: ${m[1]}`],
  [/^更新于 (.+)$/, (m) => `Updated at ${m[1]}`],
  [/^(.+) · 更新于 (.+)$/, (m) => `${m[1]} · Updated at ${m[2]}`],
  [/^(.+) · 累计提交 (\d+)$/, (m) => `${m[1]} · ${m[2]} submissions`],
  [/^(.+) · 累计提交 (\d+) · 已关闭$/, (m) => `${m[1]} · ${m[2]} submissions · Closed`],
  [/^(.+) · 许可证：(.+)$/, (m) => `${translateText(m[1])} · License: ${m[2]}`],
  [/^(.+) 页$/, (m) => m[1]],
  [/^登录为 (.+)$/, (m) => `Logged in as ${m[1]}`],
  [/^确认重置 (.+) 的密码？$/, (m) => `Reset the password for ${m[1]}?`],
  [/^(.+) 的新密码$/, (m) => `New password for ${m[1]}`],
  [/^(.+) 的初始密码$/, (m) => `Initial password for ${m[1]}`],
  [/^彻底删除用户 (.+)？该用户的所有数据将一并清除,且不可恢复。$/, (m) => `Permanently delete user ${m[1]}? All data owned by this user will also be removed and cannot be recovered.`],
  [/^共 (\d+) 人 · 第 (\d+) \/ (\d+) 页$/, (m) => `${m[1]} users · Page ${m[2]} / ${m[3]}`],
  [/^共 (\d+) 条 · 第 (\d+) \/ (\d+) 页$/, (m) => `${m[1]} logs · Page ${m[2]} / ${m[3]}`],
  [/^(.+) · 创建于 (.+)$/, (m) => `${m[1]} · Created at ${m[2]}`],
  [/^创建：(.+) · 最近重建：(.+)$/, (m) => `Created: ${m[1]} · Last regenerated: ${m[2]}`],
  [/^创建：(.+)$/, (m) => `Created: ${m[1]}`],
  [/^当前版本：(.+)·最新版本：(.+)·(.+)$/, (m) => `Current version: ${m[1]} · Latest version: ${m[2]} · ${translateText(m[3])}`],
  [/^(\d+) 分钟前$/, (m) => `${m[1]} minutes ago`],
  [/^(\d+) 小时前$/, (m) => `${m[1]} hours ago`],
  [/^(\d+) 天前$/, (m) => `${m[1]} days ago`],
  [/^IP (.+)$/, (m) => `IP ${m[1]}`],
  [/^登录 (.+)$/, (m) => `Login ${m[1]}`],
  [/^最近活跃 (.+)$/, (m) => `Last active ${m[1]}`],
  [/^默认字号（(.+)px）$/, (m) => `Default Font Size (${m[1]}px)`],
  [/^自动保存间隔（(.+) 秒）$/, (m) => `Auto-save Interval (${m[1]}s)`],
  [/^日历默认提前提醒（(.+) 分钟）$/, (m) => `Default Calendar Reminder (${m[1]} minutes early)`],
  [/^第 (\d+) \/ (\d+) 项$/, (m) => `${m[1]} / ${m[2]}`],
  [/^\+(\d+) 更多$/, (m) => `+${m[1]} more`],
  [/^提前 (.+) 分钟提醒$/, (m) => `Remind ${m[1]} minutes early`],
  [/^提前提醒（分钟）$/, () => 'Reminder (minutes before)'],
  [/^(.+) 月 (.+) 日$/, (m) => `${m[1]}/${m[2]}`],
  [/^(.+) 年 (.+) 月$/, (m) => `${m[1]} / ${m[2]}`],
  [/^(.+) 年 (.+)\/(.+) - (.+)\/(.+)$/, (m) => `${m[1]} ${m[2]}/${m[3]} - ${m[4]}/${m[5]}`],
  [/^按「(.+)」字段排布 · (.+) 年 (.+) 月$/, (m) => `Arranged by "${m[1]}" · ${m[2]} / ${m[3]}`],
  [/^当前绑定：(.+)$/, (m) => `Current email: ${m[1]}`],
  [/^最近登录 (.+)$/, (m) => `Last login ${m[1]}`],
  [/^(.+) · 最近登录 (.+)$/, (m) => `${translateText(m[1])} · Last login ${m[2]}`],
  [/^当前版本：(.+)$/, (m) => `Current version: ${m[1]}`],
  [/^最新版本：(.+)$/, (m) => `Latest version: ${m[1]}`],
  [/^仓库：(.+)$/, (m) => `Repository: ${m[1]}`],
  [/^分支：(.+)$/, (m) => `Branch: ${m[1]}`],
  [/^版本检查：(.+)$/, (m) => `Update check: ${m[1]}`],
  [/^当前提交：(.+)$/, (m) => `Current commit: ${m[1]}`],
  [/^最新提交：(.+)$/, (m) => `Latest commit: ${m[1]}`],
  [/^选择(.+)$/, (m) => `Choose ${translateText(m[1])}`],
  [/^删除(.+)$/, (m) => `Delete ${translateText(m[1])}`],
  [/^(.+) 暂无待办$/, (m) => `No todos for ${m[1]}`],
  [/^创建者：(.+)$/, (m) => `Creator: ${m[1]}`],
  [/^上传者：(.+)$/, (m) => `Uploader: ${m[1]}`],
  [/^确认将「(.+)」移动到公共知识库？移动后将从私人知识库移除，所有注册用户可查看。$/, (m) => `Move "${m[1]}" to the public workspace? It will be removed from your private workspace and visible to all registered users.`],
  [/^已移动 (\d+) 个文档到公共知识库$/, (m) => `Moved ${m[1]} documents to the public workspace`],
  [/^确认将「(.+)」复制到公共知识库？复制后所有注册用户都可以查看。$/, (m) => `Copy "${m[1]}" to the public workspace? All registered users will be able to view it.`],
  [/^已复制 (\d+) 个文档到公共知识库$/, (m) => `Copied ${m[1]} documents to the public workspace`],
  [/^确认将「(.+)」移到你的私密空间？移动后将从公共知识库移除，仅你的管理员账号可访问。$/, (m) => `Move "${m[1]}" to your private space? It will be removed from the public workspace and only your admin account will have access.`],
  [/^已将 (\d+) 个文档移到私密空间$/, (m) => `Moved ${m[1]} documents to your private space`],
  [/^确认恢复文档「(.+)」？将还原到其原位置。$/, (m) => `Restore document "${m[1]}"? It will be restored to its original location.`],
  [/^确认彻底删除文档「(.+)」？此操作不可恢复，文档及其版本、评论、附件将永久消失。$/, (m) => `Permanently delete document "${m[1]}"? This cannot be undone. The document and its versions, comments, and attachments will be permanently lost.`],
];

const attrNames = ['placeholder', 'title', 'aria-label', 'alt'] as const;
const originalText = new WeakMap<Text, string>();
const translatedText = new WeakMap<Text, string>();
const originalAttrs = new WeakMap<Element, Map<string, string>>();
const translatedAttrs = new WeakMap<Element, Map<string, string>>();

let observer: MutationObserver | null = null;
let applying = false;
let scheduled = false;

function currentLanguage(): LanguagePreference {
  if (typeof document === 'undefined') return 'zh-CN';
  return (document.documentElement.dataset.language as LanguagePreference) || 'zh-CN';
}

function shouldSkip(node: Node) {
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (!el) return false;
  return Boolean(
    el.closest(
      [
        '[data-i18n-skip]',
        '[contenteditable="true"]',
        '.ProseMirror',
        '.rich-editor',
        '.mail-html',
        'pre',
        'code',
        'script',
        'style',
      ].join(','),
    ),
  );
}

function preserveWhitespace(source: string, translated: string) {
  const leading = source.match(/^\s*/)?.[0] ?? '';
  const trailing = source.match(/\s*$/)?.[0] ?? '';
  return `${leading}${translated}${trailing}`;
}

export function translateText(value: string, language: LanguagePreference = 'en') {
  if (language !== 'en') return value;
  const compact = value.trim().replace(/\s+/g, ' ');
  if (!compact) return value;
  const exact = exactEn[compact];
  if (exact !== undefined) return preserveWhitespace(value, exact);
  for (const [pattern, render] of textPatterns) {
    const match = compact.match(pattern);
    if (match) return preserveWhitespace(value, render(match));
  }
  return value;
}

function translateTextNode(node: Text, language: LanguagePreference) {
  if (shouldSkip(node)) return;
  const current = node.nodeValue ?? '';
  let source = originalText.get(node);
  const lastTranslated = translatedText.get(node);

  if (language !== 'en') {
    const next = lastTranslated !== undefined && current === lastTranslated && source !== undefined ? source : current;
    originalText.set(node, next);
    translatedText.delete(node);
    if (node.nodeValue !== next) node.nodeValue = next;
    return;
  }

  if (source === undefined || (lastTranslated !== undefined && current !== lastTranslated)) {
    source = current;
    originalText.set(node, source);
  }
  const next = translateText(source, 'en');
  translatedText.set(node, next);
  if (node.nodeValue !== next) node.nodeValue = next;
}

function translateAttrs(el: Element, language: LanguagePreference) {
  if (shouldSkip(el)) return;
  for (const attr of attrNames) {
    const current = el.getAttribute(attr);
    if (current === null) continue;
    let map = originalAttrs.get(el);
    if (!map) {
      map = new Map();
      originalAttrs.set(el, map);
    }
    let translatedMap = translatedAttrs.get(el);
    if (!translatedMap) {
      translatedMap = new Map();
      translatedAttrs.set(el, translatedMap);
    }
    const lastTranslated = translatedMap.get(attr);
    if (language !== 'en') {
      const next = lastTranslated !== undefined && current === lastTranslated && map.has(attr) ? map.get(attr)! : current;
      map.set(attr, next);
      translatedMap.delete(attr);
      if (current !== next) el.setAttribute(attr, next);
      continue;
    }
    if (!map.has(attr) || (lastTranslated !== undefined && current !== lastTranslated)) {
      map.set(attr, current);
    }
    const source = map.get(attr) ?? current;
    const next = translateText(source, 'en');
    translatedMap.set(attr, next);
    if (current !== next) el.setAttribute(attr, next);
  }
}

function walk(root: Node, language: LanguagePreference) {
  if (shouldSkip(root)) return;
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text, language);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) translateAttrs(root as Element, language);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text, language);
    else translateAttrs(node as Element, language);
    node = walker.nextNode();
  }
}

function scheduleApply(root: Node = document.body) {
  if (scheduled || applying) return;
  scheduled = true;
  window.setTimeout(() => {
    scheduled = false;
    applying = true;
    try {
      walk(root, currentLanguage());
    } finally {
      applying = false;
    }
  }, 0);
}

export function installI18nDomTranslator() {
  if (typeof window === 'undefined' || observer) return;
  const stored = window.localStorage.getItem(LANGUAGE_KEY) as LanguagePreference | null;
  if (stored === 'en' || stored === 'zh-CN') {
    document.documentElement.dataset.language = stored;
    document.documentElement.lang = stored;
  }
  observer = new MutationObserver((mutations) => {
    if (applying) return;
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.target === document.documentElement) {
        scheduleApply(document.documentElement);
        return;
      }
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
            scheduleApply(document.documentElement);
            return;
          }
        }
      }
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-language'],
  });
  scheduleApply(document.documentElement);
}

export function applyLanguage(language?: LanguagePreference | null) {
  if (typeof document === 'undefined') return;
  const next: LanguagePreference = language === 'en' ? 'en' : 'zh-CN';
  document.documentElement.dataset.language = next;
  document.documentElement.lang = next;
  try {
    window.localStorage.setItem(LANGUAGE_KEY, next);
  } catch {
    /* ignore */
  }
  scheduleApply(document.documentElement);
}
