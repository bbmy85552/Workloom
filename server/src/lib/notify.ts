import { prisma } from '../prisma.js';
import { sendMail } from './mail.js';

export interface CreateNotificationPayload {
  userId: string;
  category: string;
  title: string;
  body?: string;
  link?: string;
  meta?: Record<string, unknown>;
  emailFallback?: { to: string; subject: string; text?: string; html?: string };
}

export async function createNotification(p: CreateNotificationPayload) {
  const n = await prisma.notification.create({
    data: {
      userId: p.userId,
      category: p.category,
      title: p.title,
      body: p.body ?? null,
      link: p.link ?? null,
      metaJson: p.meta ? JSON.stringify(p.meta) : '{}',
    },
  });
  // 同步检查用户偏好；若邮件通知打开且提供了 emailFallback 才发送
  if (p.emailFallback) {
    const pref = await prisma.userPreferences.findUnique({ where: { userId: p.userId } });
    if (pref?.notifyEmail) {
      try {
        await sendMail(p.emailFallback);
      } catch (err) {
        console.warn('[Workloom] 通知邮件发送失败：', (err as Error).message);
      }
    }
  }
  return n;
}

export async function getUnreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
