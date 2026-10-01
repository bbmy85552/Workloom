import request from 'supertest';
import type { Express } from 'express';
import { prisma } from '../src/prisma.js';
import { createApp } from '../src/app.js';
import { ensureSeed } from '../src/seed.js';
import { __testCodeMap } from '../src/lib/verifyCode.js';

let appInstance: Express | null = null;
export const TEST_INVITE_CODE = 'test-invite';

export async function getApp() {
  if (!appInstance) {
    await ensureSeed();
    appInstance = createApp();
  }
  return appInstance;
}

export async function resetData() {
  __testCodeMap.clear();
  await prisma.apiKey.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.shareLink.deleteMany({});
  await prisma.documentComment.deleteMany({});
  await prisma.documentVersion.deleteMany({});
  await prisma.resourcePresence.deleteMany({});
  await prisma.attachment.deleteMany({});
  await prisma.userAvatar.deleteMany({});
  await prisma.mailMessage.deleteMany({});
  await prisma.mailAccount.deleteMany({});
  await prisma.calendarReminderLog.deleteMany({});
  await prisma.calendarEvent.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.userPreferences.deleteMany({});
  await prisma.documentFavorite.deleteMany({});
  await prisma.tableFormView.deleteMany({});
  await prisma.tableRecord.deleteMany({});
  await prisma.tableField.deleteMany({});
  await prisma.tablePermission.deleteMany({});
  await prisma.tableBase.deleteMany({});
  await prisma.documentPermission.deleteMany({});
  await prisma.document.deleteMany({});
  await prisma.todoItem.deleteMany({});
  await prisma.userFont.deleteMany({});
  await prisma.userGroupMember.deleteMany({});
  await prisma.userGroup.deleteMany({});
  await prisma.systemSetting.deleteMany({});
  await prisma.workspace.deleteMany({
    where: { owner: { email: { not: 'admin@test.local' } }, kind: { not: 'PUBLIC' } },
  });
  await prisma.emailVerificationCode.deleteMany({});
  await prisma.rateLimitEvent.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { not: 'admin@test.local' } } });
  await ensureSeed();
}

export function readCode(email: string, purpose: string) {
  return __testCodeMap.get(`${email.toLowerCase()}:${purpose}`);
}

export async function registerUser(email: string, name = 'Tester', password = 'Aa12345678') {
  const app = await getApp();
  await prisma.systemSetting.upsert({
    where: { key: 'register_invite_code' },
    update: { value: TEST_INVITE_CODE },
    create: { key: 'register_invite_code', value: TEST_INVITE_CODE },
  });
  await request(app).post('/api/auth/register-code').send({ email, inviteCode: TEST_INVITE_CODE });
  const code = readCode(email, 'register');
  if (!code) throw new Error('test code not captured');
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, code, password, name, inviteCode: TEST_INVITE_CODE });
  return { res, cookie: res.headers['set-cookie'] as unknown as string[], password };
}

export async function loginAdmin() {
  const app = await getApp();
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@test.local', password: 'Admin@Test123' });
  return { cookie: res.headers['set-cookie'] as unknown as string[] };
}
