import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { LockKeyhole, MailCheck, ShieldCheck } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BrandLogo } from '../../components/BrandLogo';
import { api, asApiError } from '../../lib/api';

type SetupStep = 'checking' | 'locked' | 'ready' | 'done';

interface SetupStatus {
  initialized: boolean;
  setupAvailable: boolean;
}

const inputCls =
  'h-10 w-full rounded-xl border border-black/10 bg-white/75 px-3 text-sm text-text-primary outline-none transition-all focus:border-liquid-indigo focus:ring-2 focus:ring-liquid-indigo/15';

export function SetupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<SetupStep>('checking');
  const [setupToken, setSetupToken] = useState('');
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mailFromTouched, setMailFromTouched] = useState(false);
  const defaultAppUrl = useMemo(() => window.location.origin, []);
  const [form, setForm] = useState({
    appUrl: defaultAppUrl,
    adminEmail: '',
    adminName: '管理员',
    adminPassword: '',
    confirmPassword: '',
    allowPublicRegister: true,
    mailHost: '',
    mailPort: '465',
    mailSecure: true,
    mailUser: '',
    mailPass: '',
    mailFrom: '',
  });

  useEffect(() => {
    let alive = true;
    const token = searchParams.get('token')?.trim();
    async function load() {
      try {
        const { data } = await api.get<SetupStatus>('/setup/status');
        if (!alive) return;
        setStatus(data);
        if (data.initialized) {
          navigate('/login', { replace: true });
          return;
        }
        if (token) {
          await api.post('/setup/session', { token });
          if (!alive) return;
          navigate('/setup', { replace: true });
          setStep('ready');
          return;
        }
        const session = await api.get<{ ok: boolean }>('/setup/session');
        if (!alive) return;
        setStep(session.data.ok ? 'ready' : 'locked');
      } catch (err) {
        if (!alive) return;
        if (token) navigate('/setup', { replace: true });
        setTokenError(asApiError(err).error);
        setStep('locked');
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [navigate, searchParams]);

  const update = (key: keyof typeof form, value: string | boolean) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'mailUser' && !mailFromTouched) {
        next.mailFrom = value ? `文档中心 <${value}>` : '';
      }
      return next;
    });
  };

  const unlock = async (e: FormEvent) => {
    e.preventDefault();
    setTokenError(null);
    try {
      await api.post('/setup/session', { token: setupToken.trim() });
      setStep('ready');
      setSetupToken('');
    } catch (err) {
      setTokenError(asApiError(err).error);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.adminPassword !== form.confirmPassword) {
      setError('两次输入的管理员密码不一致');
      return;
    }
    setSaving(true);
    try {
      await api.post('/setup/complete', {
        appUrl: form.appUrl,
        adminEmail: form.adminEmail,
        adminName: form.adminName,
        adminPassword: form.adminPassword,
        allowPublicRegister: form.allowPublicRegister,
        mailHost: form.mailHost,
        mailPort: Number(form.mailPort),
        mailSecure: form.mailSecure,
        mailUser: form.mailUser,
        mailPass: form.mailPass,
        mailFrom: form.mailFrom,
        verifySmtp: true,
      });
      setStep('done');
      window.setTimeout(() => {
        window.location.assign('/login');
      }, 900);
    } catch (err) {
      setError(asApiError(err).error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface px-4 py-8 text-text-primary">
      <div className="pointer-events-none fixed -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-liquid-indigo/15 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-32 -right-32 h-[420px] w-[420px] rounded-full bg-primary/10 blur-3xl" />

      <main className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl flex-col justify-center">
        <div className="mb-6">
          <BrandLogo />
        </div>

        <div className="glass-panel overflow-hidden rounded-3xl">
          <div className="grid gap-0 lg:grid-cols-[0.9fr_1.4fr]">
            <section className="border-b border-black/5 bg-liquid-indigo/10 p-6 sm:p-8 lg:border-b-0 lg:border-r">
              <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-liquid-indigo text-white shadow-md shadow-liquid-indigo/25">
                <ShieldCheck size={20} />
              </div>
              <h1 className="font-serif text-3xl font-bold text-text-primary">首次配置文档中心</h1>
              <p className="mt-3 text-sm leading-6 text-text-secondary">
                初始化只会在没有任何用户时开放。请使用部署脚本输出的私密链接进入，完成后该入口会自动关闭。
              </p>
              <div className="mt-6 space-y-3 text-sm text-text-secondary">
                <Feature icon={<LockKeyhole size={16} />} text="初始化密钥只用于换取短时 HttpOnly 会话" />
                <Feature icon={<MailCheck size={16} />} text="SMTP 授权码会加密后保存到后端数据库" />
                <Feature icon={<ShieldCheck size={16} />} text="配置完成后创建管理员账号并启用正常登录" />
              </div>
            </section>

            <section className="p-6 sm:p-8">
              {step === 'checking' && <div className="text-sm text-text-secondary">正在检查初始化状态…</div>}
              {step === 'locked' && (
                <form onSubmit={unlock} className="max-w-md">
                  <h2 className="mb-2 text-xl font-semibold">需要初始化密钥</h2>
                  <p className="mb-5 text-sm leading-6 text-text-secondary">
                    普通访客不会看到配置表单。请打开部署脚本输出的私密初始化链接，或在这里粘贴初始化密钥。
                  </p>
                  {!status?.setupAvailable && (
                    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      当前服务器未设置 SETUP_TOKEN，请先在部署环境中配置后重启服务。
                    </div>
                  )}
                  <label className="mb-4 block">
                    <span className="mb-1.5 block text-xs font-medium text-text-secondary">初始化密钥</span>
                    <input
                      value={setupToken}
                      onChange={(e) => setSetupToken(e.target.value)}
                      className={inputCls}
                      type="password"
                      autoComplete="one-time-code"
                      placeholder="部署脚本输出的 SETUP_TOKEN"
                    />
                  </label>
                  {tokenError && (
                    <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
                      {tokenError}
                    </div>
                  )}
                  <button
                    type="submit"
                    className="h-10 rounded-xl bg-liquid-indigo px-5 text-sm font-medium text-white shadow-md shadow-liquid-indigo/20 hover:bg-primary disabled:opacity-60"
                    disabled={!setupToken.trim()}
                  >
                    进入配置
                  </button>
                </form>
              )}
              {step === 'ready' && (
                <form onSubmit={submit} className="space-y-7">
                  <FormSection title="访问地址">
                    <Field label="站点 URL">
                      <input
                        required
                        value={form.appUrl}
                        onChange={(e) => update('appUrl', e.target.value)}
                        className={inputCls}
                        placeholder="https://docs.example.com"
                      />
                    </Field>
                  </FormSection>

                  <FormSection title="管理员账号">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="管理员邮箱">
                        <input
                          required
                          type="email"
                          value={form.adminEmail}
                          onChange={(e) => update('adminEmail', e.target.value)}
                          className={inputCls}
                          placeholder="admin@example.com"
                        />
                      </Field>
                      <Field label="显示名称">
                        <input
                          required
                          value={form.adminName}
                          onChange={(e) => update('adminName', e.target.value)}
                          className={inputCls}
                        />
                      </Field>
                      <Field label="管理员密码">
                        <input
                          required
                          type="password"
                          minLength={8}
                          value={form.adminPassword}
                          onChange={(e) => update('adminPassword', e.target.value)}
                          className={inputCls}
                          autoComplete="new-password"
                        />
                      </Field>
                      <Field label="确认密码">
                        <input
                          required
                          type="password"
                          minLength={8}
                          value={form.confirmPassword}
                          onChange={(e) => update('confirmPassword', e.target.value)}
                          className={inputCls}
                          autoComplete="new-password"
                        />
                      </Field>
                    </div>
                  </FormSection>

                  <FormSection title="SMTP 发信配置">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="SMTP 服务器">
                        <input
                          required
                          value={form.mailHost}
                          onChange={(e) => update('mailHost', e.target.value)}
                          className={inputCls}
                          placeholder="smtp.example.com"
                        />
                      </Field>
                      <Field label="SMTP 端口">
                        <input
                          required
                          type="number"
                          min={1}
                          max={65535}
                          value={form.mailPort}
                          onChange={(e) => update('mailPort', e.target.value)}
                          className={inputCls}
                        />
                      </Field>
                      <Field label="SMTP 用户名">
                        <input
                          required
                          value={form.mailUser}
                          onChange={(e) => update('mailUser', e.target.value)}
                          className={inputCls}
                          placeholder="your-account@example.com"
                        />
                      </Field>
                      <Field label="SMTP 授权码/应用密码">
                        <input
                          required
                          type="password"
                          value={form.mailPass}
                          onChange={(e) => update('mailPass', e.target.value)}
                          className={inputCls}
                          autoComplete="new-password"
                        />
                      </Field>
                      <Field label="发信人">
                        <input
                          required
                          value={form.mailFrom}
                          onChange={(e) => {
                            setMailFromTouched(true);
                            update('mailFrom', e.target.value);
                          }}
                          className={inputCls}
                          placeholder="文档中心 <your-account@example.com>"
                        />
                      </Field>
                      <label className="flex items-center gap-2 pt-6 text-sm text-text-secondary">
                        <input
                          type="checkbox"
                          checked={form.mailSecure}
                          onChange={(e) => update('mailSecure', e.target.checked)}
                          className="h-4 w-4 rounded border-black/10 text-liquid-indigo focus:ring-liquid-indigo/20"
                        />
                        使用 SSL/TLS
                      </label>
                    </div>
                  </FormSection>

                  <label className="flex items-center gap-2 text-sm text-text-secondary">
                    <input
                      type="checkbox"
                      checked={form.allowPublicRegister}
                      onChange={(e) => update('allowPublicRegister', e.target.checked)}
                      className="h-4 w-4 rounded border-black/10 text-liquid-indigo focus:ring-liquid-indigo/20"
                    />
                    允许公开注册
                  </label>

                  {error && (
                    <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
                      {error}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={saving}
                    className="h-11 w-full rounded-xl bg-liquid-indigo text-sm font-medium text-white shadow-lg shadow-liquid-indigo/20 hover:bg-primary disabled:opacity-60"
                  >
                    {saving ? '正在验证 SMTP 并保存…' : '完成配置'}
                  </button>
                </form>
              )}
              {step === 'done' && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  初始化完成，即将进入登录页。
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-liquid-indigo">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-text-secondary">{label}</span>
      {children}
    </label>
  );
}
