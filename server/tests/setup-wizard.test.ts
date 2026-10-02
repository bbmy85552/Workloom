import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/prisma.js';
import { resetData } from './helpers.js';

async function emptyDatabase() {
  await resetData();
  await prisma.workspace.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.systemSetting.deleteMany({});
}

describe('first-run setup wizard', () => {
  beforeEach(async () => {
    await emptyDatabase();
  });

  afterEach(async () => {
    await resetData();
  });

  it('blocks normal api routes before initialization', async () => {
    const app = createApp();
    const status = await request(app).get('/api/setup/status');
    expect(status.status).toBe(200);
    expect(status.body.initialized).toBe(false);
    expect(status.body.setupAvailable).toBe(true);

    const me = await request(app).get('/api/auth/me');
    expect(me.status).toBe(503);
    expect(me.body.code).toBe('SETUP_REQUIRED');
  });

  it('requires the setup token before showing the configuration session', async () => {
    const app = createApp();
    const invalid = await request(app).post('/api/setup/session').send({ token: 'wrong-token' });
    expect(invalid.status).toBe(401);
    expect(invalid.body.code).toBe('SETUP_TOKEN_INVALID');

    const valid = await request(app)
      .post('/api/setup/session')
      .send({ token: 'test-setup-token-32-bytes-minimum-value' });
    const cookieHeader = valid.headers['set-cookie'];
    const cookieText = Array.isArray(cookieHeader) ? cookieHeader.join('') : String(cookieHeader);
    expect(valid.status).toBe(200);
    expect(cookieText).toContain('workloom_setup');
    const cookies = Array.isArray(cookieHeader) ? cookieHeader : [String(cookieHeader)];
    const currentCookie = cookies.find((value) => value.startsWith('workloom_setup='))!;
    const legacyCookie = currentCookie.split(';')[0].replace('workloom_setup=', 'jianji_setup=');
    const session = await request(app).get('/api/setup/session').set('Cookie', legacyCookie);
    expect(session.status).toBe(200);
    expect(session.body.ok).toBe(true);
  });

  it('creates the administrator and stores smtp secrets encrypted', async () => {
    const app = createApp();
    const agent = request.agent(app);
    await agent
      .post('/api/setup/session')
      .send({ token: 'test-setup-token-32-bytes-minimum-value' })
      .expect(200);

    await agent
      .post('/api/setup/complete')
      .send({
        appUrl: 'https://workloom.example.com',
        adminEmail: 'owner@example.com',
        adminName: 'Owner',
        adminPassword: 'Owner@123456',
        allowPublicRegister: false,
        mailHost: 'smtp.example.com',
        mailPort: 465,
        mailSecure: true,
        mailUser: 'owner@example.com',
        mailPass: 'smtp-secret-pass',
        mailFrom: 'Workloom <owner@example.com>',
        verifySmtp: false,
      })
      .expect(200);

    const status = await request(app).get('/api/setup/status');
    expect(status.body.initialized).toBe(true);

    const admin = await prisma.user.findUnique({ where: { email: 'owner@example.com' } });
    expect(admin?.role).toBe('ADMIN');
    expect(admin?.passwordHash).not.toBe('Owner@123456');

    const storedPass = await prisma.systemSetting.findUnique({ where: { key: 'mail_pass_enc' } });
    expect(storedPass?.value).toBeTruthy();
    expect(storedPass?.value).not.toContain('smtp-secret-pass');

    const registerCode = await request(app)
      .post('/api/auth/register-code')
      .send({ email: 'new@example.com' });
    expect(registerCode.status).toBe(403);
    expect(registerCode.body.code).toBe('REGISTER_CLOSED');

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@example.com', password: 'Owner@123456' });
    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe('owner@example.com');
  });
});
