import { useCallback, useEffect, useRef, useState } from 'react';
import { Save, Mail, Send, Download, Upload, Database, RefreshCw, Bell, CheckCircle2 } from 'lucide-react';
import { api, asApiError, downloadFromApi } from '../../lib/api';
import { useUiStore } from '../../store/ui';
import type { AdminStats, AdminUpdateStatus, SystemSettings } from '../../lib/types';

export function AdminSettingsPage() {
  const showToast = useUiStore((s) => s.showToast);
  const confirmDialog = useUiStore((s) => s.confirmDialog);
  const [settings, setSettings] = useState<SystemSettings>({
    allow_public_register: 'true',
    default_workspace_name: '我的空间',
    max_upload_mb: '25',
    brand_name: '文档中心',
    company_name: '文档中心',
    oa_url: 'https://2dqy-oa.2dqy.com/calendar',
    register_invite_code: '',
  });
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testSubject, setTestSubject] = useState('');
  const [testing, setTesting] = useState(false);
  const [testInfo, setTestInfo] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreInfo, setRestoreInfo] = useState<string | null>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const migrationInputRef = useRef<HTMLInputElement>(null);
  const [migrationRestoring, setMigrationRestoring] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<AdminUpdateStatus | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, st, update] = await Promise.all([
        api.get<{ settings: SystemSettings }>('/admin/settings'),
        api.get<AdminStats>('/admin/stats'),
        api.get<AdminUpdateStatus>('/admin/update/status'),
      ]);
      setSettings(s.data.settings);
      setStats(st.data);
      setUpdateStatus(update.data);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/admin/settings', settings);
      showToast('已保存', 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      setSaving(false);
    }
  };

  const exportBackup = async () => {
    try {
      await downloadFromApi('/admin/backup', 'jianji-backup.json');
      showToast('备份已开始下载', 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const exportMigration = async () => {
    try {
      await downloadFromApi('/admin/migration', 'jianji-migration.json');
      showToast('完整迁移包已开始下载', 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  const restoreBackup = async (file: File) => {
    const ok = await confirmDialog({
      title: '恢复备份',
      message: '恢复会用备份内容覆盖当前数据库，请确认已保存当前数据。',
      confirmText: '恢复',
      danger: true,
    });
    if (!ok) return;
    setRestoring(true);
    setRestoreInfo(null);
    try {
      const backup = JSON.parse(await file.text());
      const { data } = await api.post<{ counts: Record<string, number> }>('/admin/backup/restore', {
        confirm: 'RESTORE',
        backup,
      });
      const total = Object.values(data.counts).reduce((sum, n) => sum + n, 0);
      setRestoreInfo(`已恢复 ${total} 条记录，请刷新页面确认最新数据。`);
      showToast('备份已恢复', 'success');
      await load();
    } catch (err) {
      showToast(asApiError(err).error || '备份文件解析失败', 'error');
    } finally {
      setRestoring(false);
    }
  };

  const restoreMigration = async (file: File) => {
    const ok = await confirmDialog({
      title: '导入完整迁移包',
      message: '导入会覆盖当前数据库并写入备份中的上传文件。请确认当前服务器已有备份。',
      confirmText: '导入',
      danger: true,
    });
    if (!ok) return;
    setMigrationRestoring(true);
    setRestoreInfo(null);
    try {
      const backup = JSON.parse(await file.text());
      const { data } = await api.post<{
        counts: Record<string, number>;
        restoredFiles: number;
      }>('/admin/migration/restore', {
        confirm: 'RESTORE',
        backup,
      });
      const total = Object.values(data.counts).reduce((sum, n) => sum + n, 0);
      setRestoreInfo(`已导入 ${total} 条记录和 ${data.restoredFiles} 个文件，请刷新页面确认最新数据。`);
      showToast('完整迁移包已导入', 'success');
      await load();
    } catch (err) {
      showToast(asApiError(err).error || '迁移包解析失败', 'error');
    } finally {
      setMigrationRestoring(false);
    }
  };

  const checkUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateInfo(null);
    try {
      const { data } = await api.get<AdminUpdateStatus>('/admin/update/status');
      setUpdateStatus(data);
      const latest = data.latestCommit
        ? `${data.updateBranch || 'main'}@${data.latestCommit.slice(0, 7)}`
        : data.latestVersion;
      setUpdateInfo(data.hasUpdate ? `发现新版本 ${latest}` : '当前已是最新版本');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const startUpdate = async () => {
    const ok = await confirmDialog({
      title: '开始更新',
      message: '系统会先通知所有用户文档中心正在更新；如果服务器未配置自动更新命令，请按提示在服务器执行更新脚本。',
      confirmText: '开始',
    });
    if (!ok) return;
    setUpdating(true);
    setUpdateInfo(null);
    try {
      const { data } = await api.post<{
        mode: 'auto' | 'manual';
        message?: string;
        notified?: { users: number; emails: number; emailErrors: number };
      }>('/admin/update/start', { latestVersion: updateStatus?.latestVersion });
      setUpdateInfo(
        data.mode === 'auto'
          ? '更新已执行，用户已收到更新完成通知。'
          : data.message || '已发送维护通知，请在服务器完成手动更新。',
      );
      showToast('更新流程已启动', 'success');
      await checkUpdate();
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      setUpdating(false);
    }
  };

  const finishUpdate = async () => {
    setUpdating(true);
    try {
      await api.post('/admin/update/finish', {});
      setUpdateInfo('已发送更新完成通知。');
      showToast('已发送完成通知', 'success');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="py-6 sm:py-8 animate-fade-in-up max-w-3xl">
      <header className="mb-6">
        <h1 className="text-3xl font-serif font-bold text-text-primary">系统设置</h1>
        <p className="text-text-secondary text-sm mt-1">管理员可调整应用全局策略</p>
      </header>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="用户数" value={stats.userCount} />
          <StatCard label="文档数" value={stats.docCount} />
          <StatCard label="表格数" value={stats.tableCount} />
          <StatCard
            label="附件占用"
            value={`${(stats.attachmentTotalSize / 1024 / 1024).toFixed(1)} MB`}
            small
          />
        </div>
      )}

      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <SettingRow
          label="品牌名称"
          hint="登录页与顶部导航显示的名称"
        >
          <input
            value={settings.brand_name}
            onChange={(e) => setSettings((s) => ({ ...s, brand_name: e.target.value }))}
            className="w-full h-9 px-2 text-sm rounded-md border border-black/10 bg-white"
          />
        </SettingRow>
        <SettingRow
          label="公司名"
          hint="显示在侧边栏品牌名称下方"
        >
          <input
            value={settings.company_name}
            onChange={(e) => setSettings((s) => ({ ...s, company_name: e.target.value }))}
            placeholder="例如：某某科技"
            className="w-full h-9 px-2 text-sm rounded-md border border-black/10 bg-white"
          />
        </SettingRow>
        <SettingRow
          label="注册邀请码"
          hint="新用户必须填写正确邀请码才能注册"
        >
          <input
            value={settings.register_invite_code}
            onChange={(e) => setSettings((s) => ({ ...s, register_invite_code: e.target.value }))}
            placeholder="设置后发给需要注册的成员"
            className="w-full h-9 px-2 text-sm rounded-md border border-black/10 bg-white"
          />
        </SettingRow>
        <SettingRow
          label="OA 地址"
          hint="侧边栏 OA 页面 iframe 加载的 URL"
        >
          <input
            type="url"
            value={settings.oa_url}
            onChange={(e) => setSettings((s) => ({ ...s, oa_url: e.target.value }))}
            placeholder="https://2dqy-oa.2dqy.com/calendar"
            className="w-full h-9 px-2 text-sm rounded-md border border-black/10 bg-white"
          />
        </SettingRow>
        <SettingRow
          label="默认工作区名称"
          hint="新用户注册或被创建时自动生成的工作区名"
        >
          <input
            value={settings.default_workspace_name}
            onChange={(e) =>
              setSettings((s) => ({ ...s, default_workspace_name: e.target.value }))
            }
            className="w-full h-9 px-2 text-sm rounded-md border border-black/10 bg-white"
          />
        </SettingRow>
        <SettingRow
          label="单文件最大体积 (MB)"
          hint="影响上传接口的拒绝阈值（仅作记录，实际限制需重启后生效）"
        >
          <input
            type="number"
            min={1}
            max={500}
            value={settings.max_upload_mb}
            onChange={(e) => setSettings((s) => ({ ...s, max_upload_mb: e.target.value }))}
            className="w-32 h-9 px-2 text-sm rounded-md border border-black/10 bg-white"
          />
        </SettingRow>
        <SettingRow label="是否允许公开注册" hint="关闭后注册接口将拒绝新用户">
          <select
            value={settings.allow_public_register}
            onChange={(e) =>
              setSettings((s) => ({ ...s, allow_public_register: e.target.value }))
            }
            className="h-9 px-2 text-sm rounded-md border border-black/10 bg-white"
          >
            <option value="true">允许</option>
            <option value="false">禁止</option>
          </select>
        </SettingRow>
        <div className="pt-3">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1 px-4 h-9 rounded-md bg-liquid-indigo text-white text-sm hover:bg-primary disabled:opacity-60"
          >
            <Save size={14} /> {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6 mt-6 space-y-3">
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-liquid-indigo" />
          <h2 className="text-base font-semibold">发送测试邮件</h2>
        </div>
        <p className="text-xs text-text-secondary">
          通过网页初始化保存的 SMTP 配置向指定地址发送测试邮件；若未初始化 SMTP，则回退读取服务器环境变量配置。
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="收件人邮箱"
            className="h-9 px-2 text-sm rounded-md border border-black/10 bg-white"
          />
          <input
            value={testSubject}
            onChange={(e) => setTestSubject(e.target.value)}
            placeholder="邮件主题"
            className="h-9 px-2 text-sm rounded-md border border-black/10 bg-white"
          />
        </div>
        <button
          onClick={async () => {
            if (!testTo) {
              showToast('请填写收件人邮箱', 'error');
              return;
            }
            setTesting(true);
            setTestInfo(null);
            try {
              const payload = testSubject.trim()
                ? { to: testTo, subject: testSubject.trim() }
                : { to: testTo };
              const { data } = await api.post<{ ok: boolean; transport: string }>('/admin/mail/test', payload);
              setTestInfo(
                data.transport === 'smtp'
                  ? `已通过 SMTP 发送到 ${testTo}`
                  : `测试环境日志传输：${testTo}`,
              );
              showToast('测试请求已发送', 'success');
            } catch (err) {
              showToast(asApiError(err).error, 'error');
            } finally {
              setTesting(false);
            }
          }}
          disabled={testing}
          className="inline-flex items-center gap-1 px-4 h-9 rounded-md bg-liquid-indigo text-white text-sm hover:bg-primary disabled:opacity-60"
        >
          <Send size={14} /> {testing ? '发送中…' : '发送'}
        </button>
        {testInfo && <div className="text-xs text-text-secondary">{testInfo}</div>}
      </div>

      <div className="glass-panel rounded-2xl p-6 mt-6 space-y-3">
        <div className="flex items-center gap-2">
          <RefreshCw size={16} className="text-liquid-indigo" />
          <h2 className="text-base font-semibold">版本更新</h2>
        </div>
        <p className="text-xs text-text-secondary">
          管理员确认更新后，会先向右上角消息中心和用户注册邮箱发送维护通知。服务器未配置自动更新命令时，可按 README 的备用方案执行无损更新脚本。
        </p>
        <div className="rounded-xl bg-black/[0.03] px-3 py-2 text-sm text-text-secondary">
          当前版本：<span className="font-medium text-text-primary">{updateStatus?.currentVersion ?? '未知'}</span>
          <span className="mx-2">·</span>
          最新版本：<span className="font-medium text-text-primary">{updateStatus?.latestVersion ?? '未知'}</span>
          <span className="mx-2">·</span>
          {updateStatus?.autoUpdateConfigured ? '已配置自动更新命令' : '未配置自动更新命令'}
          {(updateStatus?.currentCommit || updateStatus?.latestCommit) && (
            <div className="mt-1 text-xs break-all">
              当前提交：{updateStatus.currentCommit ? updateStatus.currentCommit.slice(0, 12) : '未知'}
              <span className="mx-1">·</span>
              最新提交：{updateStatus.latestCommit ? updateStatus.latestCommit.slice(0, 12) : '未知'}
            </div>
          )}
          {updateStatus?.updateRepo && (
            <div className="mt-1 text-xs break-all">
              仓库：{updateStatus.updateRepo}
              <span className="mx-1">·</span>
              分支：{updateStatus.updateBranch || 'main'}
            </div>
          )}
          {updateStatus?.checkUrl && (
            <div className="mt-1 text-xs break-all">版本检查：{updateStatus.checkUrl}</div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={checkUpdate}
            disabled={checkingUpdate}
            className="inline-flex items-center gap-1 px-4 h-9 rounded-md border border-black/10 text-sm hover:bg-black/5 disabled:opacity-60"
          >
            <RefreshCw size={14} className={checkingUpdate ? 'animate-spin' : ''} /> 检查更新
          </button>
          <button
            onClick={startUpdate}
            disabled={updating || !updateStatus?.hasUpdate}
            className="inline-flex items-center gap-1 px-4 h-9 rounded-md bg-liquid-indigo text-white text-sm hover:bg-primary disabled:opacity-60"
          >
            <Bell size={14} /> {updating ? '处理中…' : '通知并更新'}
          </button>
          <button
            onClick={finishUpdate}
            disabled={updating}
            className="inline-flex items-center gap-1 px-4 h-9 rounded-md border border-black/10 text-sm hover:bg-black/5 disabled:opacity-60"
          >
            <CheckCircle2 size={14} /> 发送完成通知
          </button>
        </div>
        {updateInfo && <div className="text-xs text-text-secondary">{updateInfo}</div>}
      </div>

      <div className="glass-panel rounded-2xl p-6 mt-6 space-y-3">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-liquid-indigo" />
          <h2 className="text-base font-semibold">数据备份与恢复</h2>
        </div>
        <p className="text-xs text-text-secondary">
          数据库备份包含用户、文档、表格、日程、邮件缓存与系统设置；完整迁移包还会包含上传文件和脱敏配置摘要，适合迁移到新服务器。
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportBackup}
            className="inline-flex items-center gap-1 px-4 h-9 rounded-md bg-liquid-indigo text-white text-sm hover:bg-primary"
          >
            <Download size={14} /> 导出数据库备份
          </button>
          <button
            onClick={() => restoreInputRef.current?.click()}
            disabled={restoring}
            className="inline-flex items-center gap-1 px-4 h-9 rounded-md border border-black/10 text-sm hover:bg-black/5 disabled:opacity-60"
          >
            <Upload size={14} /> {restoring ? '恢复中…' : '恢复数据库备份'}
          </button>
          <button
            onClick={exportMigration}
            className="inline-flex items-center gap-1 px-4 h-9 rounded-md bg-liquid-indigo text-white text-sm hover:bg-primary"
          >
            <Download size={14} /> 导出完整迁移包
          </button>
          <button
            onClick={() => migrationInputRef.current?.click()}
            disabled={migrationRestoring}
            className="inline-flex items-center gap-1 px-4 h-9 rounded-md border border-black/10 text-sm hover:bg-black/5 disabled:opacity-60"
          >
            <Upload size={14} /> {migrationRestoring ? '导入中…' : '导入迁移包'}
          </button>
        </div>
        <div className="text-[11px] text-text-secondary">
          迁移包可能包含加密后的邮箱凭据和附件文件，请只保存在可信位置；明文密钥、AccessKey 和服务器 `.env` 不会写入仓库发布包。
        </div>
        <input
          ref={restoreInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void restoreBackup(file);
            e.target.value = '';
          }}
        />
        <input
          ref={migrationInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void restoreMigration(file);
            e.target.value = '';
          }}
        />
        {restoreInfo && <div className="text-xs text-text-secondary">{restoreInfo}</div>}
      </div>
    </div>
  );
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <label className="text-sm font-medium text-text-primary">{label}</label>
        {hint && <div className="text-xs text-text-secondary">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  small,
}: {
  label: string;
  value: number | string;
  small?: boolean;
}) {
  return (
    <div className="glass-card rounded-xl p-3">
      <div className="text-xs text-text-secondary mb-1">{label}</div>
      <div className={small ? 'text-base font-semibold' : 'text-2xl font-serif font-semibold'}>
        {value}
      </div>
    </div>
  );
}
