import { prisma } from '../prisma.js';

// 精选日期按北京时间（Asia/Shanghai）算，与每日简报的日期口径一致。
const shanghaiDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function shanghaiDate(d: Date = new Date()): string {
  return shanghaiDay.format(d);
}

export function isValidDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

// 记录型分享链接建好后自动进时间线：默认归当天、同天内排最后。
// 已有记录时不覆盖（回填/管理员调整过的日期和顺序不动）。
export async function ensureDailyPick(shareLinkId: string, featuredDate?: string): Promise<void> {
  const date = featuredDate ?? shanghaiDate();
  const max = await prisma.dailyPick.findFirst({
    where: { featuredDate: date },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  await prisma.dailyPick.upsert({
    where: { shareLinkId },
    create: { shareLinkId, featuredDate: date, sortOrder: (max?.sortOrder ?? -1) + 1 },
    update: {},
  });
}
