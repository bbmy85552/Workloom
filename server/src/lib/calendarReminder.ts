import { prisma } from '../prisma.js';
import { expandCalendarEvents } from './calendarRepeat.js';
import { createNotification } from './notify.js';
import { getMailBrandName } from './systemSettings.js';

let timer: NodeJS.Timeout | null = null;

async function tick() {
  const now = new Date();
  // 在未来 15 秒到过去 5 分钟之间触发的事件（避免错过）
  const upper = new Date(now.getTime() + 15_000);
  const lower = new Date(now.getTime() - 5 * 60_000);
  const scanTo = new Date(upper.getTime() + 14 * 24 * 60 * 60 * 1000);
  const events = await prisma.calendarEvent.findMany({
    where: {
      reminderMinutes: { not: null },
      startAt: { lte: scanTo },
    },
    take: 500,
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  const brandName = await getMailBrandName();
  for (const ev of expandCalendarEvents(events, lower, scanTo)) {
    if (ev.reminderMinutes == null) continue;
    const remindAt = new Date(ev.startAt.getTime() - ev.reminderMinutes * 60_000);
    if (remindAt > upper) continue; // 还没到提醒时间
    if (remindAt < lower) continue; // 太久之前
    const reminderKey = ev.occurrenceKey;
    const already = await prisma.calendarReminderLog.findUnique({ where: { eventId: reminderKey } });
    if (already) continue;
    await prisma.calendarReminderLog.create({ data: { eventId: reminderKey } });
    await createNotification({
      userId: ev.userId,
      category: 'calendar_reminder',
      title: `日程提醒：${ev.title}`,
      body: `将在 ${new Date(ev.startAt).toLocaleString('zh-CN')} 开始${ev.location ? '，地点：' + ev.location : ''}`,
      link: '/app/calendar',
      meta: { eventId: ev.id },
      emailFallback: {
        to: ev.user.email,
        subject: `[${brandName}] 日程提醒：${ev.title}`,
        text: `${ev.title}\n开始时间：${new Date(ev.startAt).toLocaleString('zh-CN')}${ev.location ? '\n地点：' + ev.location : ''}${ev.description ? '\n\n' + ev.description : ''}`,
      },
    });
  }
}

export function startCalendarReminder() {
  if (timer) return;
  // 立即跑一次，然后每 30 秒
  void tick().catch((err) => console.warn('[简记] 提醒扫描失败:', err.message));
  timer = setInterval(() => {
    void tick().catch((err) => console.warn('[简记] 提醒扫描失败:', err.message));
  }, 30_000);
  if (timer.unref) timer.unref();
}

export function stopCalendarReminder() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
