import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../env.js';
import { getRuntimeMailConfig, type RuntimeMailConfig } from './systemSettings.js';

let transporterCache: { fingerprint: string; transporter: Transporter; from: string } | null = null;

async function getTransporter() {
  const cfg = await getRuntimeMailConfig();
  if (!cfg) return null;
  if (!cfg.host || !cfg.from) {
    throw new Error('SMTP 配置不完整：请设置 MAIL_HOST 和 MAIL_FROM。');
  }
  if (cfg.user && !cfg.pass) {
    throw new Error('SMTP 配置不完整：设置 MAIL_USER 时必须同时设置 MAIL_PASS。');
  }
  const fingerprint = mailFingerprint(cfg);
  if (transporterCache?.fingerprint === fingerprint) return transporterCache;
  transporterCache?.transporter.close();
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
  transporterCache = { fingerprint, transporter, from: cfg.from };
  return transporterCache;
}

function mailFingerprint(cfg: RuntimeMailConfig) {
  return JSON.stringify({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    user: cfg.user,
    pass: cfg.pass,
    from: cfg.from,
  });
}

export interface MailPayload {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendMail(payload: MailPayload) {
  const cached = await getTransporter();
  if (!cached) {
    if (env.NODE_ENV !== 'test') {
      throw new Error('未启用 SMTP，无法发送邮件验证码或通知。请配置 MAIL_ENABLED=true 和 MAIL_*。');
    }
    console.log(
      `[简记][MAIL:TEST] 收件人=${payload.to} 主题="${payload.subject}"\n内容:\n${payload.text ?? payload.html ?? ''}`,
    );
    return { ok: true, transport: 'log' as const };
  }
  await cached.transporter.sendMail({
    from: cached.from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });
  return { ok: true, transport: 'smtp' as const };
}

export function renderCodeMail(code: string, purpose: string, brandName = '文档中心') {
  const purposeLabel: Record<string, string> = {
    register: '注册账号',
    bind_email: '绑定邮箱',
    change_email: '更换邮箱',
    reset_password: '重置密码',
  };
  const label = purposeLabel[purpose] ?? '邮箱验证';
  return {
    subject: `[${brandName}] ${label}验证码：${code}`,
    text: `您好，您的验证码为 ${code}，用于${label}，10 分钟内有效。如非本人操作请忽略。`,
    html: `
      <div style="font-family: -apple-system, system-ui, sans-serif; line-height:1.6;">
        <p>您好，</p>
        <p>您的验证码为：<strong style="font-size:20px;letter-spacing:4px;">${code}</strong></p>
        <p>用于：${label}，10 分钟内有效。</p>
        <p style="color:#888;font-size:12px;">如非本人操作，请忽略本邮件。</p>
      </div>
    `,
  };
}
