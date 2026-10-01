import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout, Input, PrimaryButton } from './AuthLayout';
import { api, asApiError } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import type { CurrentUser } from '../../lib/types';
import {
  clearRememberedLogin,
  readRememberedLogin,
  saveRememberedLogin,
} from '../../lib/rememberedLogin';
import { DEFAULT_PUBLIC_SETTINGS, fetchPublicSettings } from '../../lib/publicSettings';
import { GoogleSignInButton } from './GoogleSignInButton';

export function LoginPage() {
  const remembered = readRememberedLogin();
  const [email, setEmail] = useState(remembered?.email ?? '');
  const [password, setPassword] = useState('');
  const [rememberEmail, setRememberEmail] = useState(Boolean(remembered));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingGoogleCredential, setPendingGoogleCredential] = useState<string | null>(null);
  const [googleInviteCode, setGoogleInviteCode] = useState('');
  const [brandName, setBrandName] = useState(DEFAULT_PUBLIC_SETTINGS.brandName);
  const setUser = useAuthStore((s) => s.setUser);
  // setUser 后由外层 RequireGuest 统一跳转到来源页，LoginPage 不自行 navigate

  useEffect(() => {
    let alive = true;
    void fetchPublicSettings()
      .then((settings) => {
        if (alive) setBrandName(settings.brandName);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post<{ user: CurrentUser }>('/auth/login', {
        email,
        password,
      });
      if (rememberEmail) {
        saveRememberedLogin({ email });
      } else {
        clearRememberedLogin();
      }
      setUser(data.user);
      // 不在此处 navigate：setUser 会触发外层 RequireGuest 检测到已登录，
      // 由它统一负责跳转到来源页（next/state.from），避免与声明式 Navigate 竞争。
    } catch (err) {
      setError(asApiError(err).error);
    } finally {
      setLoading(false);
    }
  };

  const submitGoogle = async (credential: string) => {
    setError(null);
    setPendingGoogleCredential(null);
    setGoogleInviteCode('');
    setLoading(true);
    try {
      const { data } = await api.post<{ user: CurrentUser }>('/auth/google', { credential });
      setUser(data.user);
      // 由 RequireGuest 统一跳转
    } catch (err) {
      const apiError = asApiError(err);
      if (apiError.code === 'INVALID_INVITE_CODE') {
        setPendingGoogleCredential(credential);
        setError('这个 Google 邮箱还没有账号。请输入管理员提供的邀请码继续注册，或退出本次 Google 登录。');
      } else {
        setError(apiError.error);
      }
    } finally {
      setLoading(false);
    }
  };

  const continueGoogleWithInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingGoogleCredential) return;
    const inviteCode = googleInviteCode.trim();
    if (!inviteCode) {
      setError('请先填写邀请码');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post<{ user: CurrentUser }>('/auth/google', {
        credential: pendingGoogleCredential,
        inviteCode,
      });
      setUser(data.user);
      // 由 RequireGuest 统一跳转
    } catch (err) {
      const apiError = asApiError(err);
      if (apiError.code === 'INVALID_INVITE_CODE') {
        setError('邀请码不正确，请重新填写，或退出本次 Google 登录。');
      } else {
        setError(apiError.error);
      }
    } finally {
      setLoading(false);
    }
  };

  const cancelPendingGoogle = () => {
    setPendingGoogleCredential(null);
    setGoogleInviteCode('');
    setError(null);
  };

  return (
    <AuthLayout
      title="欢迎回来"
      subtitle={`登录${brandName}，开始你的工作。`}
      footer={
        <>
          还没有账号？<Link to="/register" className="text-liquid-indigo hover:underline">注册</Link>
          <span className="mx-2">·</span>
          <Link to="/forgot-password" className="text-liquid-indigo hover:underline">忘记密码</Link>
        </>
      }
    >
      {pendingGoogleCredential ? (
        <form onSubmit={continueGoogleWithInvite} className="space-y-4">
          <div className="rounded-2xl border border-liquid-indigo/15 bg-liquid-indigo/5 p-4">
            <div className="text-sm font-medium text-text-primary">需要邀请码</div>
            <p className="mt-1 text-xs leading-5 text-text-secondary">
              这个 Google 邮箱还没有账号。填写管理员提供的邀请码后，会直接创建账号并登录。
            </p>
          </div>
          <Input
            label="邀请码"
            required
            autoComplete="off"
            value={googleInviteCode}
            onChange={(e) => setGoogleInviteCode(e.target.value)}
            placeholder="请输入管理员提供的邀请码"
          />
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={cancelPendingGoogle}
              className="h-10 flex-1 rounded-xl border border-black/10 bg-white/70 text-sm font-medium text-text-secondary transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              退出
            </button>
            <PrimaryButton type="submit" loading={loading} className="h-10 flex-1 py-0">
              继续
            </PrimaryButton>
          </div>
        </form>
      ) : (
        <>
          <div className="mb-5">
            <GoogleSignInButton
              disabled={loading}
              disabledLabel="Google 登录处理中…"
              onCredential={submitGoogle}
            />
          </div>
          <div className="mb-5 flex items-center gap-3 text-xs text-text-secondary">
            <span className="h-px flex-1 bg-black/10" />
            <span>或使用邮箱登录</span>
            <span className="h-px flex-1 bg-black/10" />
          </div>
          <form onSubmit={submit}>
        <Input
          label="邮箱"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <Input
          label="密码"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="请输入密码"
        />
        <label className="mb-4 flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={rememberEmail}
            onChange={(e) => setRememberEmail(e.target.checked)}
            className="h-4 w-4 rounded border-black/10 text-liquid-indigo focus:ring-liquid-indigo/20"
          />
          记住邮箱（不会保存密码）
        </label>
        {error && (
          <div className="mb-4 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <PrimaryButton type="submit" loading={loading}>
          登录
        </PrimaryButton>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
