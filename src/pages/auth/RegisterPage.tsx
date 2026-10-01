import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout, Input, PrimaryButton } from './AuthLayout';
import { api, asApiError } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import type { CurrentUser } from '../../lib/types';
import { GoogleSignInButton } from './GoogleSignInButton';

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [validatedInviteCode, setValidatedInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const setUser = useAuthStore((s) => s.setUser);
  // setUser 后由外层 RequireGuest 统一跳转到来源页，RegisterPage 不自行 navigate

  const timerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    },
    [],
  );

  const startCountdown = (seconds: number) => {
    setCountdown(seconds);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setCountdown((s) => {
        if (s <= 1) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const registrationEnabled = inviteStatus === 'valid' && validatedInviteCode === inviteCode.trim();

  const validateInvite = async () => {
    const trimmed = inviteCode.trim();
    setError(null);
    setHint(null);
    if (!trimmed) {
      setInviteStatus('idle');
      setValidatedInviteCode('');
      setError('请先填写邀请码');
      return false;
    }
    setInviteStatus('checking');
    try {
      await api.post('/auth/validate-invite', { inviteCode: trimmed });
      setValidatedInviteCode(trimmed);
      setInviteStatus('valid');
      setHint('邀请码验证通过，可以继续注册。');
      return true;
    } catch (err) {
      setValidatedInviteCode('');
      setInviteStatus('invalid');
      setError(asApiError(err).error);
      return false;
    }
  };

  const ensureInviteValid = async () => {
    if (registrationEnabled) return true;
    return validateInvite();
  };

  const handleInviteChange = (value: string) => {
    setInviteCode(value);
    setValidatedInviteCode('');
    setInviteStatus('idle');
    setHint(null);
    setError(null);
  };

  const sendCode = async () => {
    setError(null);
    setHint(null);
    if (!(await ensureInviteValid())) return;
    if (!email) {
      setError('请先填写邮箱');
      return;
    }
    setSending(true);
    try {
      const { data } = await api.post<{ ok: boolean; ttlSeconds: number }>(
        '/auth/register-code',
        { email, inviteCode },
      );
      setHint(`验证码已发送，有效期 ${Math.round((data.ttlSeconds ?? 600) / 60)} 分钟`);
      startCountdown(60);
    } catch (err) {
      const e = asApiError(err);
      setError(e.error);
      if (e.code === 'CODE_RESEND_TOO_FAST') {
        const remain = (e.details as any)?.remainingSeconds;
        if (typeof remain === 'number') startCountdown(remain);
      }
    } finally {
      setSending(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setHint(null);
    if (!(await ensureInviteValid())) return;
    setLoading(true);
    try {
      const { data } = await api.post<{ user: CurrentUser }>('/auth/register', {
        email,
        name,
        password,
        code,
        inviteCode,
      });
      setUser(data.user);
      // 由 RequireGuest 统一跳转
    } catch (err) {
      setError(asApiError(err).error);
    } finally {
      setLoading(false);
    }
  };

  const submitGoogle = async (credential: string) => {
    setError(null);
    setHint(null);
    if (!(await ensureInviteValid())) return;
    setLoading(true);
    try {
      const { data } = await api.post<{ user: CurrentUser }>('/auth/google', {
        credential,
        inviteCode,
      });
      setUser(data.user);
      // 由 RequireGuest 统一跳转
    } catch (err) {
      setError(asApiError(err).error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="创建账号"
      subtitle="使用管理员提供的邀请码注册。"
      footer={
        <>
          已有账号？<Link to="/login" className="text-liquid-indigo hover:underline">登录</Link>
        </>
      }
    >
      <form onSubmit={submit}>
        <Input
          label="邀请码"
          required
          autoComplete="off"
          value={inviteCode}
          onChange={(e) => handleInviteChange(e.target.value)}
          placeholder="请输入管理员提供的邀请码"
        />
        <div className="-mt-2 mb-5 flex items-center gap-2">
          <button
            type="button"
            disabled={inviteStatus === 'checking' || !inviteCode.trim()}
            onClick={validateInvite}
            className="h-10 rounded-xl border border-liquid-indigo/30 px-4 text-sm font-medium text-liquid-indigo transition hover:bg-liquid-indigo/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {inviteStatus === 'checking' ? '验证中…' : '验证邀请码'}
          </button>
          {inviteStatus === 'valid' && (
            <span className="text-xs text-emerald-700">已通过</span>
          )}
          {inviteStatus === 'invalid' && (
            <span className="text-xs text-red-600">邀请码不正确</span>
          )}
        </div>
        <div className="mb-5">
          <GoogleSignInButton
            text="signup_with"
            disabled={!registrationEnabled || loading}
            disabledLabel="请先验证邀请码"
            onCredential={submitGoogle}
          />
        </div>
        <div className="mb-5 flex items-center gap-3 text-xs text-text-secondary">
          <span className="h-px flex-1 bg-black/10" />
          <span>或使用邮箱验证码注册</span>
          <span className="h-px flex-1 bg-black/10" />
        </div>
        <Input
          label="邮箱"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={!registrationEnabled}
        />
        <div className="mb-4 flex items-end gap-2">
          <div className="flex-1">
            <span className="block text-xs font-medium text-text-secondary mb-1.5">邮箱验证码</span>
            <input
              required
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="6 位数字"
              disabled={!registrationEnabled}
              className="w-full px-3 py-2.5 rounded-xl border border-black/10 bg-white/70 text-sm text-text-primary outline-none focus:border-liquid-indigo focus:ring-2 focus:ring-liquid-indigo/15"
            />
          </div>
          <button
            type="button"
            disabled={!registrationEnabled || sending || countdown > 0}
            onClick={sendCode}
            className="shrink-0 px-3 h-[42px] rounded-xl border border-liquid-indigo/30 text-liquid-indigo text-sm font-medium hover:bg-liquid-indigo/5 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {countdown > 0 ? `${countdown}s 后重发` : sending ? '发送中…' : '获取验证码'}
          </button>
        </div>
        <Input
          label="用户名"
          required
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="你想要的展示名"
          disabled={!registrationEnabled}
        />
        <Input
          label="密码"
          type="password"
          required
          minLength={8}
          maxLength={64}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="至少 8 位"
          disabled={!registrationEnabled}
        />
        {hint && (
          <div className="mb-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
            {hint}
          </div>
        )}
        {error && (
          <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <PrimaryButton type="submit" loading={loading} disabled={!registrationEnabled}>
          注册并登录
        </PrimaryButton>
      </form>
    </AuthLayout>
  );
}
