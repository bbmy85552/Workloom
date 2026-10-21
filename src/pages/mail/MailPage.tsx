import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  Mail,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  Trash2,
  Sparkles,
  Wrench,
  ListTodo,
  Maximize2,
  SlidersHorizontal,
  FolderSync,
  Paperclip,
  Upload,
} from 'lucide-react';
import type { UserPreferences } from '../../lib/types';
import { api, asApiError } from '../../lib/api';
import type { MailAccount, MailMessageDetail, MailMessageItem } from '../../lib/types';
import { useUiStore } from '../../store/ui';
import { Modal } from '../../components/Modal';
import { MailHtmlBody } from '../../components/mail/MailHtmlBody';

interface ComposeState {
  mode: 'compose' | 'reply';
  accountId: string;
  to: string;
  cc: string;
  subject: string;
  body: string;
  attachments: File[];
}

interface AccountFormState {
  id?: string;
  label: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  password: string;
  fromName: string;
  signature: string;
  isDefault: boolean;
}

const PRESETS = [
  { label: '163', imapHost: 'imap.163.com', imapPort: 993, smtpHost: 'smtp.163.com', smtpPort: 465 },
  { label: 'QQ', imapHost: 'imap.qq.com', imapPort: 993, smtpHost: 'smtp.qq.com', smtpPort: 465 },
  { label: 'Gmail', imapHost: 'imap.gmail.com', imapPort: 993, smtpHost: 'smtp.gmail.com', smtpPort: 465 },
  {
    label: 'Outlook',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    smtpHost: 'smtp-mail.outlook.com',
    smtpPort: 587,
  },
] as const;

const DEFAULT_MAIL_PREFS = { listPageSize: 30, syncLimit: 50 };

function emptyAccountForm(): AccountFormState {
  return {
    label: '我的邮箱',
    email: '',
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    username: '',
    password: '',
    fromName: '',
    signature: '',
    isDefault: false,
  };
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function boundedInt(value: string | number, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export function MailPage() {
  const showToast = useUiStore((s) => s.showToast);
  const confirmDialog = useUiStore((s) => s.confirmDialog);

  const openMailLink = useCallback(
    async (href: string) => {
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        showToast('无法识别该链接地址', 'error');
        return;
      }
      if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) {
        showToast('该链接类型存在风险，已阻止打开', 'error');
        return;
      }

      const target = url.toString();
      const ok = await confirmDialog({
        title: '打开邮件链接',
        message: (
          <div className="space-y-2 text-sm">
            <p className="text-text-primary">邮件正文中的链接可能指向外部网站。是否在新窗口打开？</p>
            <div className="rounded-xl border border-black/10 bg-black/[0.03] px-3 py-2 text-xs text-text-secondary break-all">
              {target}
            </div>
          </div>
        ),
        confirmText: '打开链接',
        cancelText: '取消',
      });
      if (!ok) return;
      window.open(target, '_blank', 'noopener,noreferrer');
    },
    [confirmDialog, showToast],
  );
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [folders, setFolders] = useState<string[]>(['INBOX']);
  const [currentFolder, setCurrentFolder] = useState('INBOX');
  const [messages, setMessages] = useState<MailMessageItem[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<MailMessageDetail | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [accountForm, setAccountForm] = useState<AccountFormState | null>(null);
  const [quick, setQuick] = useState<{
    open: boolean;
    email: string;
    password: string;
    label: string;
    detected: null | {
      key: string;
      label: string;
      imapHost: string;
      smtpHost: string;
      hint?: string;
      helpUrl?: string;
    };
    detecting: boolean;
    submitting: boolean;
    error: string;
  } | null>(null);
  const [composing, setComposing] = useState<ComposeState | null>(null);
  const [mailPrefs, setMailPrefs] = useState(DEFAULT_MAIL_PREFS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState({
    listPageSize: String(DEFAULT_MAIL_PREFS.listPageSize),
    syncLimit: String(DEFAULT_MAIL_PREFS.syncLimit),
  });
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const messageBodyRef = useRef<HTMLDivElement | null>(null);

  async function loadMailPrefs() {
    try {
      const { data } = await api.get<{ preferences: UserPreferences }>('/me/preferences');
      const p = data.preferences;
      const listPageSize = p.mailListPageSize ?? 30;
      const syncLimit = p.mailSyncLimit ?? 50;
      setMailPrefs({ listPageSize, syncLimit });
      setSettingsDraft({ listPageSize: String(listPageSize), syncLimit: String(syncLimit) });
    } catch {
      /* 使用默认值 */
    }
  }

  async function saveMailPrefs() {
    const next = {
      listPageSize: boundedInt(settingsDraft.listPageSize, 10, 100, mailPrefs.listPageSize),
      syncLimit: boundedInt(settingsDraft.syncLimit, 10, 200, mailPrefs.syncLimit),
    };
    try {
      const { data } = await api.put<{ preferences: UserPreferences }>('/me/preferences', {
        mailListPageSize: next.listPageSize,
        mailSyncLimit: next.syncLimit,
      });
      const p = data.preferences;
      setMailPrefs({
        listPageSize: p.mailListPageSize ?? next.listPageSize,
        syncLimit: p.mailSyncLimit ?? next.syncLimit,
      });
      setSettingsDraft({
        listPageSize: String(p.mailListPageSize ?? next.listPageSize),
        syncLimit: String(p.mailSyncLimit ?? next.syncLimit),
      });
      setSettingsOpen(false);
      showToast('邮箱设置已保存', 'success');
      if (currentId) void loadMessages(currentId);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  }

  async function loadAccounts() {
    try {
      const { data } = await api.get<{ list: MailAccount[] }>('/mail/accounts');
      setAccounts(data.list);
      if (!currentId && data.list.length > 0) {
        setCurrentId(data.list.find((a) => a.isDefault)?.id ?? data.list[0].id);
      }
      if (currentId && !data.list.find((a) => a.id === currentId)) {
        setCurrentId(data.list[0]?.id ?? null);
      }
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  }

  async function loadFolders(id: string, fresh = false) {
    try {
      const { data } = await api.get<{ list: string[] }>(`/mail/accounts/${id}/folders`, {
        params: fresh ? { fresh: 1 } : undefined,
      });
      const next = data.list.length ? data.list : ['INBOX'];
      setFolders(next);
      if (!next.includes(currentFolder)) setCurrentFolder('INBOX');
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  }

  async function loadMessages(
    id: string,
    pageSize = mailPrefs.listPageSize,
    folder = currentFolder,
  ) {
    try {
      const { data } = await api.get<{ list: MailMessageItem[] }>(
        `/mail/accounts/${id}/messages`,
        { params: { page: 1, pageSize, folder } },
      );
      setMessages(data.list);
      setSelectedMessage(null);
      setFullscreenOpen(false);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  }

  useEffect(() => {
    void loadMailPrefs();
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (currentId) {
      void loadFolders(currentId);
      void loadMessages(currentId, mailPrefs.listPageSize, currentFolder);
    }
    else {
      setMessages([]);
      setSelectedMessage(null);
      setFullscreenOpen(false);
      setFolders(['INBOX']);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, mailPrefs.listPageSize, currentFolder]);

  useLayoutEffect(() => {
    messageBodyRef.current?.scrollTo({ top: 0, left: 0 });
  }, [selectedMessage?.id]);

  async function openMessage(id: string) {
    try {
      const { data } = await api.get<{ message: MailMessageDetail }>(`/mail/messages/${id}`);
      setSelectedMessage(data.message);
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, isRead: true } : m)));
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  }

  async function sync() {
    if (!currentId) return;
    setSyncing(true);
    try {
      const { data } = await api.post<{ synced: number }>(
        `/mail/accounts/${currentId}/sync?limit=${mailPrefs.syncLimit}&folder=${encodeURIComponent(currentFolder)}`,
      );
      showToast(`已同步 ${data.synced} 封`, 'success');
      loadMessages(currentId, mailPrefs.listPageSize, currentFolder);
      loadFolders(currentId);
      loadAccounts();
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      setSyncing(false);
    }
  }

  async function testConnection(accountId: string) {
    try {
      const { data } = await api.post<{
        result: { imap: { ok: boolean; error: string }; smtp: { ok: boolean; error: string } };
      }>(`/mail/accounts/${accountId}/test`);
      const ok = data.result.imap.ok && data.result.smtp.ok;
      showToast(
        ok
          ? '连接测试成功（IMAP & SMTP 均可用）'
          : `IMAP: ${data.result.imap.ok ? 'OK' : data.result.imap.error}\nSMTP: ${data.result.smtp.ok ? 'OK' : data.result.smtp.error}`,
        ok ? 'success' : 'error',
      );
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  }

  async function deleteAccount(id: string) {
    const ok = await confirmDialog({
      title: '删除邮箱账户',
      message: '确定删除该邮箱账户？该账户的同步邮件也会被清理。',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/mail/accounts/${id}`);
      showToast('已删除', 'success');
      loadAccounts();
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  }

  async function saveAccount() {
    if (!accountForm) return;
    if (!accountForm.email || !accountForm.imapHost || !accountForm.smtpHost) {
      showToast('请填写完整的邮箱与服务器配置', 'error');
      return;
    }
    try {
      const payload = {
        ...accountForm,
        password: accountForm.password || undefined,
      };
      if (accountForm.id) {
        await api.patch(`/mail/accounts/${accountForm.id}`, payload);
      } else {
        if (!accountForm.password) {
          showToast('请填写授权码或登录密码', 'error');
          return;
        }
        await api.post('/mail/accounts', payload);
      }
      showToast('已保存', 'success');
      setAccountForm(null);
      loadAccounts();
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  }

  function initialAccountId() {
    return currentId ?? accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? '';
  }

  function signatureFor(accountId: string) {
    return accounts.find((a) => a.id === accountId)?.signature || '';
  }

  function openCompose() {
    const accountId = initialAccountId();
    if (!accountId) {
      showToast('请先绑定一个邮箱账号', 'error');
      return;
    }
    setComposing({
      mode: 'compose',
      accountId,
      to: '',
      cc: '',
      subject: '',
      body: signatureFor(accountId),
      attachments: [],
    });
  }

  function openReply(message: MailMessageDetail) {
    const accountId = message.account.id || initialAccountId();
    if (!accountId) {
      showToast('请先绑定一个邮箱账号', 'error');
      return;
    }
    setComposing({
      mode: 'reply',
      accountId,
      to: message.fromEmail || '',
      cc: '',
      subject: '',
      body: '',
      attachments: [],
    });
  }

  async function sendMail() {
    if (!composing) return;
    if (!composing.accountId) {
      showToast('请选择发件邮箱', 'error');
      return;
    }
    const to = composing.to.split(',').map((s) => s.trim()).filter(Boolean);
    const cc = composing.cc.split(',').map((s) => s.trim()).filter(Boolean);
    if (to.length === 0) {
      showToast('收件人不能为空', 'error');
      return;
    }
    if (!composing.body.trim() && composing.attachments.length === 0) {
      showToast('请填写正文或添加附件', 'error');
      return;
    }
    try {
      if (composing.attachments.length > 0) {
        const form = new FormData();
        form.append('to', JSON.stringify(to));
        if (cc.length > 0) form.append('cc', JSON.stringify(cc));
        form.append('subject', composing.subject);
        form.append('text', composing.body);
        composing.attachments.forEach((file) => form.append('attachments', file));
        await api.post(`/mail/accounts/${composing.accountId}/send`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await api.post(`/mail/accounts/${composing.accountId}/send`, {
          to,
          cc: cc.length > 0 ? cc : undefined,
          subject: composing.subject,
          text: composing.body,
        });
      }
      showToast('已发送', 'success');
      setComposing(null);
      void loadFolders(composing.accountId);
      if (currentId === composing.accountId) void loadMessages(composing.accountId, mailPrefs.listPageSize, currentFolder);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  }

  async function moveMessage(folder: string) {
    if (!selectedMessage || !currentId) return;
    try {
      await api.patch(`/mail/messages/${selectedMessage.id}`, { folder });
      showToast(`已移动到 ${folder}`, 'success');
      setSelectedMessage(null);
      await loadFolders(currentId);
      await loadMessages(currentId, mailPrefs.listPageSize, currentFolder);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  }

  const currentAccount = accounts.find((a) => a.id === currentId) ?? null;

  function openQuick() {
    setQuick({
      open: true,
      email: '',
      password: '',
      label: '',
      detected: null,
      detecting: false,
      submitting: false,
      error: '',
    });
  }

  async function detectProvider(email: string) {
    if (!quick) return;
    setQuick({ ...quick, email, detecting: true, error: '' });
    try {
      const { data } = await api.post<{
        matched: boolean;
        provider?: {
          key: string;
          label: string;
          imapHost: string;
          smtpHost: string;
          hint?: string;
          helpUrl?: string;
        };
      }>('/mail/detect', { email });
      setQuick((prev) =>
        prev
          ? {
              ...prev,
              email,
              detecting: false,
              detected: data.matched && data.provider ? data.provider : null,
              error: data.matched ? '' : '未自动识别服务商，可在「高级配置」手动填写。',
            }
          : prev,
      );
    } catch (err) {
      setQuick((prev) =>
        prev ? { ...prev, detecting: false, error: asApiError(err).error } : prev,
      );
    }
  }

  async function submitQuick() {
    if (!quick) return;
    if (!quick.email || !quick.password) {
      setQuick({ ...quick, error: '请输入邮箱地址和授权码' });
      return;
    }
    setQuick({ ...quick, submitting: true, error: '' });
    try {
      await api.post('/mail/quick-bind', {
        email: quick.email,
        password: quick.password,
        label: quick.label || undefined,
        isDefault: accounts.length === 0,
      });
      showToast('已成功绑定邮箱', 'success');
      setQuick(null);
      await loadAccounts();
    } catch (err) {
      const msg = asApiError(err).error;
      setQuick((prev) => (prev ? { ...prev, submitting: false, error: msg } : prev));
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden gap-4 sm:gap-5">
      <div className="shrink-0 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-serif font-bold text-text-primary">邮箱</h1>
          <p className="text-sm text-text-secondary mt-1">聚合多个邮箱账号，统一收发邮件</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {accounts.length > 1 && (
            <select
              value={currentId ?? ''}
              onChange={(e) => {
                setCurrentId(e.target.value);
                setCurrentFolder('INBOX');
              }}
              className="lg:hidden text-sm px-2 py-1.5 rounded-lg border border-black/10 bg-white max-w-[45vw]"
              aria-label="切换邮箱账号"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={openQuick}
            className="text-sm px-3 py-1.5 rounded-lg bg-liquid-indigo text-white inline-flex items-center gap-1"
          >
            <Sparkles size={14} /> 一键绑定
          </button>
          <button
            onClick={() => setAccountForm(emptyAccountForm())}
            className="text-sm px-3 py-1.5 rounded-lg border border-black/10 inline-flex items-center gap-1"
          >
            <Wrench size={14} /> 高级配置
          </button>
          <button
            onClick={() => {
              setSettingsDraft({
                listPageSize: String(mailPrefs.listPageSize),
                syncLimit: String(mailPrefs.syncLimit),
              });
              setSettingsOpen(true);
            }}
            className="text-sm px-3 py-1.5 rounded-lg border border-black/10 inline-flex items-center gap-1"
          >
            <SlidersHorizontal size={14} /> 邮箱设置
          </button>
          {accounts.length > 0 && (
            <select
              value={currentId ?? ''}
              onChange={(e) => {
                setCurrentId(e.target.value || null);
                setCurrentFolder('INBOX');
              }}
              className="text-sm px-3 py-1.5 rounded-lg border border-black/10 bg-white max-w-full sm:max-w-[360px]"
              title="当前收发邮箱"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} ({a.email})
                </option>
              ))}
            </select>
          )}
          {currentAccount && (
            <>
              <button
                onClick={sync}
                disabled={syncing}
                className="text-sm px-3 py-1.5 rounded-lg border border-black/10 inline-flex items-center gap-1"
              >
                <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> 同步{currentFolder}
              </button>
              <button
                onClick={openCompose}
                className="text-sm px-3 py-1.5 rounded-lg bg-liquid-indigo text-white hover:bg-primary inline-flex items-center gap-1"
              >
                <Send size={14} /> 写邮件
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_minmax(0,1.4fr)] gap-4 overflow-hidden">
        <div className="bg-surface-container-lowest border border-black/5 rounded-2xl flex flex-col min-h-0 min-w-0 overflow-hidden h-full max-lg:hidden">
          <div className="text-xs uppercase tracking-wider text-text-secondary px-4 py-3 shrink-0 border-b border-black/5">
            已绑定账号
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
            {accounts.length === 0 && (
              <div className="text-sm text-text-secondary px-2 py-6 text-center">
                <Mail className="mx-auto mb-2" size={20} />
                暂无邮箱
              </div>
            )}
            {accounts.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  setCurrentId(a.id);
                  setCurrentFolder('INBOX');
                }}
                className={`w-full text-left rounded-xl px-3 py-2 ${
                  a.id === currentId
                    ? 'bg-liquid-indigo/10 text-liquid-indigo'
                    : 'hover:bg-black/[0.03]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{a.label}</div>
                    <div className="text-xs text-text-secondary break-all">{a.email}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      title="编辑"
                      className="p-1 rounded hover:bg-black/5"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAccountForm({
                          id: a.id,
                          label: a.label,
                          email: a.email,
                          imapHost: a.imapHost,
                          imapPort: a.imapPort,
                          imapSecure: a.imapSecure,
                          smtpHost: a.smtpHost,
                          smtpPort: a.smtpPort,
                          smtpSecure: a.smtpSecure,
                          username: a.username,
                          password: '',
                          fromName: a.fromName ?? '',
                          signature: a.signature ?? '',
                          isDefault: a.isDefault,
                        });
                      }}
                    >
                      <Settings2 size={13} />
                    </span>
                    <span
                      title="删除"
                      className="p-1 rounded hover:bg-black/5"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteAccount(a.id);
                      }}
                    >
                      <Trash2 size={13} />
                    </span>
                  </div>
                </div>
                {a.lastError && (
                  <div className="text-[10px] text-red-500 mt-1 line-clamp-2 break-words">
                    {a.lastError}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className={`bg-surface-container-lowest border border-black/5 rounded-2xl flex flex-col min-h-0 min-w-0 overflow-hidden h-full ${selectedMessage ? 'max-lg:hidden' : ''}`}>
          <div className="px-3 py-3 border-b border-black/5 text-xs text-text-secondary shrink-0 flex items-center justify-between gap-2">
            <span>
              {currentFolder} · {messages.length} 封
              {currentAccount ? ` · ${currentAccount.label}` : ''}
            </span>
            <span className="flex items-center gap-1">
              <select
                value={currentFolder}
                onChange={(e) => setCurrentFolder(e.target.value)}
                className="max-w-[130px] rounded-md border border-black/10 bg-white px-2 py-1 text-xs"
              >
                {folders.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <button
                onClick={() => currentId && loadFolders(currentId, true)}
                className="p-1 rounded hover:bg-black/5"
                title="刷新远端文件夹"
              >
                <FolderSync size={12} />
              </button>
              <span className="text-[10px] text-text-secondary/80">显示 {mailPrefs.listPageSize} 封</span>
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="text-sm text-text-secondary py-10 text-center px-4">
                {currentAccount ? '点击"同步收件箱"拉取最新邮件' : '请先绑定一个邮箱'}
              </div>
            ) : (
              <div className="divide-y divide-black/5">
                {messages.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => openMessage(m.id)}
                    className={`w-full text-left px-3 py-2 hover:bg-black/[0.03] ${
                      selectedMessage?.id === m.id ? 'bg-liquid-indigo/5' : ''
                    } ${m.isRead ? '' : 'font-medium'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm truncate min-w-0 flex-1">
                        {m.fromName || m.fromEmail || '未知发件人'}
                      </div>
                      <div className="text-[11px] text-text-secondary shrink-0">
                        {new Date(m.receivedAt).toLocaleString('zh-CN', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <div className="text-sm truncate">{m.subject || '（无主题）'}</div>
                    <div className="text-xs text-text-secondary truncate">{m.preview}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={`bg-surface-container-lowest border border-black/5 rounded-2xl flex flex-col min-h-0 min-w-0 overflow-hidden h-full ${selectedMessage ? '' : 'max-lg:hidden'}`}>
          {!selectedMessage ? (
            <div className="text-sm text-text-secondary py-10 text-center flex-1 flex items-center justify-center">
              选择一封邮件查看
            </div>
          ) : (
            <>
              <div className="lg:hidden px-4 pt-3 shrink-0">
                <button
                  onClick={() => setSelectedMessage(null)}
                  className="inline-flex items-center gap-1 text-sm text-text-secondary"
                >
                  <ChevronLeft size={16} /> 返回邮件列表
                </button>
              </div>
              <div className="px-4 pt-4 pb-3 shrink-0 border-b border-black/5">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xl font-semibold flex-1 min-w-0 break-words">
                    {selectedMessage.subject || '（无主题）'}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setFullscreenOpen(true)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-black/10 text-text-secondary hover:bg-black/5"
                      title="大屏预览"
                    >
                      <Maximize2 size={12} /> 大屏
                    </button>
                    <button
                      onClick={() => openReply(selectedMessage)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-black/10 text-text-secondary hover:bg-black/5"
                      title="回信"
                    >
                      <Send size={12} /> 回信
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await api.post(`/mail/messages/${selectedMessage.id}/to-todo`, {});
                          showToast('已添加到今日待办', 'success');
                        } catch (err) {
                          showToast(asApiError(err).error, 'error');
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-black/10 text-text-secondary hover:bg-black/5"
                      title="转为待办"
                    >
                      <ListTodo size={12} /> 待办
                    </button>
                    <button
                      onClick={() => moveMessage('Archive')}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-black/10 text-text-secondary hover:bg-black/5"
                    >
                      归档
                    </button>
                    <button
                      onClick={() => moveMessage('Trash')}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-black/10 text-text-secondary hover:bg-black/5"
                    >
                      垃圾箱
                    </button>
                  </div>
                </div>
                <div className="text-xs text-text-secondary mt-1 truncate">
                  {selectedMessage.fromName || ''} &lt;{selectedMessage.fromEmail}&gt; ·{' '}
                  {new Date(selectedMessage.receivedAt).toLocaleString('zh-CN')}
                </div>
                <div className="text-xs text-text-secondary truncate">
                  收件人：{selectedMessage.to.map((t) => t.address).join(', ')}
                </div>
              </div>
              <div ref={messageBodyRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-3">
                {selectedMessage.htmlBody ? (
                  <MailHtmlBody html={selectedMessage.htmlBody} onOpenLink={openMailLink} />
                ) : (
                  <pre className="text-sm whitespace-pre-wrap font-sans break-words">
                    {selectedMessage.textBody || '（邮件无正文）'}
                  </pre>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        open={!!accountForm}
        title={accountForm?.id ? '编辑邮箱账户' : '绑定邮箱账户'}
        onClose={() => setAccountForm(null)}
        size="lg"
      >
        {accountForm && (
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div className="flex flex-wrap gap-2 text-xs">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() =>
                    setAccountForm({
                      ...accountForm,
                      imapHost: p.imapHost,
                      imapPort: p.imapPort,
                      smtpHost: p.smtpHost,
                      smtpPort: p.smtpPort,
                      imapSecure: p.imapPort === 993,
                      smtpSecure: p.smtpPort === 465,
                    })
                  }
                  className="px-2 py-1 rounded border border-black/10 hover:bg-black/5"
                >
                  使用 {p.label} 预设
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-secondary">显示名</label>
                <input
                  value={accountForm.label}
                  onChange={(e) => setAccountForm({ ...accountForm, label: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-black/10 bg-white"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary">邮箱地址</label>
                <input
                  value={accountForm.email}
                  onChange={(e) =>
                    setAccountForm({
                      ...accountForm,
                      email: e.target.value,
                      username: accountForm.username || e.target.value,
                    })
                  }
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-black/10 bg-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-secondary">登录用户名（通常同邮箱）</label>
                <input
                  value={accountForm.username}
                  onChange={(e) => setAccountForm({ ...accountForm, username: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-black/10 bg-white"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary">
                  授权码 / 密码{accountForm.id ? '（留空表示不更改）' : ''}
                </label>
                <input
                  type="password"
                  value={accountForm.password}
                  onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-black/10 bg-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wider text-text-secondary">IMAP（收件）</div>
                <input
                  value={accountForm.imapHost}
                  onChange={(e) => setAccountForm({ ...accountForm, imapHost: e.target.value })}
                  placeholder="服务器地址"
                  className="w-full px-3 py-2 rounded-lg border border-black/10 bg-white"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={accountForm.imapPort}
                    onChange={(e) =>
                      setAccountForm({ ...accountForm, imapPort: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-black/10 bg-white"
                  />
                  <label className="text-xs flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={accountForm.imapSecure}
                      onChange={(e) => setAccountForm({ ...accountForm, imapSecure: e.target.checked })}
                    />
                    SSL
                  </label>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wider text-text-secondary">SMTP（发件）</div>
                <input
                  value={accountForm.smtpHost}
                  onChange={(e) => setAccountForm({ ...accountForm, smtpHost: e.target.value })}
                  placeholder="服务器地址"
                  className="w-full px-3 py-2 rounded-lg border border-black/10 bg-white"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={accountForm.smtpPort}
                    onChange={(e) =>
                      setAccountForm({ ...accountForm, smtpPort: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-black/10 bg-white"
                  />
                  <label className="text-xs flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={accountForm.smtpSecure}
                      onChange={(e) => setAccountForm({ ...accountForm, smtpSecure: e.target.checked })}
                    />
                    SSL
                  </label>
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs text-text-secondary">显示发件人名</label>
              <input
                value={accountForm.fromName}
                onChange={(e) => setAccountForm({ ...accountForm, fromName: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-black/10 bg-white"
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary">签名（可选）</label>
              <textarea
                rows={3}
                value={accountForm.signature}
                onChange={(e) => setAccountForm({ ...accountForm, signature: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-black/10 bg-white"
              />
            </div>
            <label className="text-xs text-text-secondary flex items-center gap-1">
              <input
                type="checkbox"
                checked={accountForm.isDefault}
                onChange={(e) => setAccountForm({ ...accountForm, isDefault: e.target.checked })}
              />
              设为默认账号
            </label>
            <div className="flex items-center justify-between pt-2">
              {accountForm.id ? (
                <button
                  onClick={() => testConnection(accountForm.id!)}
                  className="text-sm text-liquid-indigo hover:underline"
                >
                  测试连接
                </button>
              ) : (
                <span className="text-xs text-text-secondary">提示：QQ / 163 等需在邮箱网页开启 IMAP 并使用授权码</span>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setAccountForm(null)}
                  className="px-3 py-1.5 rounded-lg border border-black/10 text-sm"
                >
                  取消
                </button>
                <button
                  onClick={saveAccount}
                  className="px-4 py-1.5 rounded-lg bg-liquid-indigo text-white text-sm"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!quick?.open}
        title="一键绑定邮箱"
        onClose={() => setQuick(null)}
        size="lg"
      >
        {quick && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-text-secondary">邮箱地址</label>
              <input
                value={quick.email}
                onChange={(e) =>
                  setQuick({ ...quick, email: e.target.value, detected: null, error: '' })
                }
                onBlur={(e) => {
                  if (e.target.value.includes('@')) void detectProvider(e.target.value);
                }}
                placeholder="例如 you@163.com"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-black/10 bg-white"
              />
              {quick.detecting && (
                <div className="text-xs text-text-secondary mt-1">正在识别服务商…</div>
              )}
              {quick.detected && (
                <div className="mt-2 text-xs rounded-lg bg-liquid-indigo/5 border border-liquid-indigo/20 px-3 py-2 text-text-secondary">
                  已识别为 <strong className="text-liquid-indigo">{quick.detected.label}</strong>
                  ，IMAP: {quick.detected.imapHost} · SMTP: {quick.detected.smtpHost}
                  {quick.detected.hint && (
                    <div className="mt-1">提示：{quick.detected.hint}</div>
                  )}
                  {quick.detected.helpUrl && (
                    <a
                      href={quick.detected.helpUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-liquid-indigo hover:underline mt-1 inline-block"
                    >
                      查看官方授权码教程 →
                    </a>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs text-text-secondary">授权码 / 应用专用密码</label>
              <input
                type="password"
                value={quick.password}
                onChange={(e) => setQuick({ ...quick, password: e.target.value, error: '' })}
                placeholder="不是邮箱登录密码，而是邮箱网页端生成的授权码"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-black/10 bg-white"
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary">显示名（可选）</label>
              <input
                value={quick.label}
                onChange={(e) => setQuick({ ...quick, label: e.target.value })}
                placeholder="留空将使用服务商名"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-black/10 bg-white"
              />
            </div>
            {quick.error && (
              <div className="text-xs whitespace-pre-line text-red-500 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
                {quick.error}
              </div>
            )}
            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => {
                  setQuick(null);
                  setAccountForm({ ...emptyAccountForm(), email: quick.email });
                }}
                className="text-sm text-text-secondary hover:underline"
              >
                改用高级配置
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setQuick(null)}
                  className="px-3 py-1.5 rounded-lg border border-black/10 text-sm"
                >
                  取消
                </button>
                <button
                  onClick={submitQuick}
                  disabled={quick.submitting || !quick.email || !quick.password}
                  className="px-4 py-1.5 rounded-lg bg-liquid-indigo text-white text-sm disabled:opacity-50"
                >
                  {quick.submitting ? '正在验证并保存…' : '一键完成绑定'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="邮箱模块设置"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs text-text-secondary block mb-1">
              列表显示邮件数（10–100）
            </label>
            <input
              type="number"
              min={10}
              max={100}
              value={settingsDraft.listPageSize}
              onChange={(e) =>
                setSettingsDraft((s) => ({
                  ...s,
                  listPageSize: e.target.value.replace(/[^\d]/g, ''),
                }))
              }
              onBlur={() =>
                setSettingsDraft((s) => ({
                  ...s,
                  listPageSize: String(boundedInt(s.listPageSize, 10, 100, mailPrefs.listPageSize)),
                }))
              }
              className="w-full px-3 py-2 rounded-lg border border-black/10 bg-white text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary block mb-1">
              每次同步拉取数量（10–200）
            </label>
            <input
              type="number"
              min={10}
              max={200}
              value={settingsDraft.syncLimit}
              onChange={(e) =>
                setSettingsDraft((s) => ({
                  ...s,
                  syncLimit: e.target.value.replace(/[^\d]/g, ''),
                }))
              }
              onBlur={() =>
                setSettingsDraft((s) => ({
                  ...s,
                  syncLimit: String(boundedInt(s.syncLimit, 10, 200, mailPrefs.syncLimit)),
                }))
              }
              className="w-full px-3 py-2 rounded-lg border border-black/10 bg-white text-sm"
            />
          </div>
          <p className="text-xs text-text-secondary">
            保存后将按新数量刷新列表；同步时使用「同步拉取数量」从服务器拉取最新邮件。
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setSettingsOpen(false)}
              className="px-3 py-1.5 rounded-lg border border-black/10 text-sm"
            >
              取消
            </button>
            <button
              onClick={saveMailPrefs}
              className="px-4 py-1.5 rounded-lg bg-liquid-indigo text-white text-sm"
            >
              保存
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={fullscreenOpen && !!selectedMessage}
        onClose={() => setFullscreenOpen(false)}
        title={selectedMessage?.subject || '（无主题）'}
        size="xl"
      >
        {selectedMessage && (
          <div className="space-y-3 max-h-[75vh] overflow-y-auto">
            <div className="text-xs text-text-secondary">
              {selectedMessage.fromName || ''} &lt;{selectedMessage.fromEmail}&gt; ·{' '}
              {new Date(selectedMessage.receivedAt).toLocaleString('zh-CN')}
            </div>
            <div className="text-xs text-text-secondary">
              收件人：{selectedMessage.to.map((t) => t.address).join(', ')}
            </div>
            {selectedMessage.htmlBody ? (
              <MailHtmlBody html={selectedMessage.htmlBody} onOpenLink={openMailLink} />
            ) : (
              <pre className="text-sm whitespace-pre-wrap font-sans break-words">
                {selectedMessage.textBody || '（邮件无正文）'}
              </pre>
            )}
          </div>
        )}
      </Modal>

      <Modal open={!!composing} title={composing?.mode === 'reply' ? '回信' : '写邮件'} onClose={() => setComposing(null)} size="lg">
        {composing && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-text-secondary">发件人</label>
              <select
                value={composing.accountId}
                onChange={(e) => {
                  const nextAccountId = e.target.value;
                  setComposing({ ...composing, accountId: nextAccountId });
                }}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-black/10 bg-white"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} &lt;{a.email}&gt;
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-text-secondary">收件人（多人用逗号分隔）</label>
              <input
                value={composing.to}
                onChange={(e) => setComposing({ ...composing, to: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-black/10 bg-white"
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary">抄送</label>
              <input
                value={composing.cc}
                onChange={(e) => setComposing({ ...composing, cc: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-black/10 bg-white"
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary">主题</label>
              <input
                value={composing.subject}
                onChange={(e) => setComposing({ ...composing, subject: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-black/10 bg-white"
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary">正文</label>
              <textarea
                rows={8}
                value={composing.body}
                onChange={(e) => setComposing({ ...composing, body: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-black/10 bg-white"
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary">附件</label>
              <div className="mt-1 rounded-lg border border-dashed border-black/15 bg-white px-3 py-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-black/10 px-3 py-1.5 text-sm text-text-secondary hover:bg-black/5">
                  <Upload size={14} /> 添加附件
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (files.length > 0) {
                        setComposing({
                          ...composing,
                          attachments: [...composing.attachments, ...files],
                        });
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                {composing.attachments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {composing.attachments.map((file, index) => (
                      <div
                        key={`${file.name}-${file.size}-${index}`}
                        className="flex items-center justify-between gap-2 rounded-md bg-black/[0.03] px-2 py-1 text-xs"
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <Paperclip size={12} className="shrink-0 text-text-secondary" />
                          <span className="truncate">{file.name}</span>
                          <span className="shrink-0 text-text-secondary">
                            {formatFileSize(file.size)}
                          </span>
                        </div>
                        <button
                          onClick={() =>
                            setComposing({
                              ...composing,
                              attachments: composing.attachments.filter((_, i) => i !== index),
                            })
                          }
                          className="shrink-0 rounded px-1.5 py-0.5 text-text-secondary hover:bg-black/5 hover:text-red-500"
                          title="移除附件"
                        >
                          移除
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setComposing(null)}
                className="px-3 py-1.5 rounded-lg border border-black/10 text-sm"
              >
                取消
              </button>
              <button
                onClick={sendMail}
                className="px-4 py-1.5 rounded-lg bg-liquid-indigo text-white text-sm inline-flex items-center gap-1"
              >
                <Send size={14} /> 发送
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
