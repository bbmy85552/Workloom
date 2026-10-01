import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/prisma.js';
import { getApp, readCode, resetData, TEST_INVITE_CODE } from './helpers.js';
import { env } from '../src/env.js';

beforeAll(async () => {
  await getApp();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await resetData();
});

describe('注册与验证码', () => {
  async function enableInviteCode() {
    await prisma.systemSetting.upsert({
      where: { key: 'register_invite_code' },
      update: { value: TEST_INVITE_CODE },
      create: { key: 'register_invite_code', value: TEST_INVITE_CODE },
    });
  }

  it('完整邮箱验证码注册流程可成功', async () => {
    const app = await getApp();
    await enableInviteCode();
    const email = 'alice@test.local';
    const r1 = await request(app).post('/api/auth/register-code').send({ email, inviteCode: TEST_INVITE_CODE });
    expect(r1.status).toBe(200);
    const code = readCode(email, 'register')!;
    expect(code).toMatch(/^\d{6}$/);

    const r2 = await request(app)
      .post('/api/auth/register')
      .send({ email, code, password: 'Aa12345678', name: 'Alice', inviteCode: TEST_INVITE_CODE });
    expect(r2.status).toBe(200);
    expect(r2.body.user.email).toBe(email);
    expect(r2.headers['set-cookie']).toBeDefined();
  });

  it('错误验证码会增加 attempts 并最终拒绝', async () => {
    const app = await getApp();
    await enableInviteCode();
    const email = 'bob@test.local';
    await request(app).post('/api/auth/register-code').send({ email, inviteCode: TEST_INVITE_CODE });
    for (let i = 0; i < 5; i++) {
      const r = await request(app)
        .post('/api/auth/register')
        .send({ email, code: '000000', password: 'Aa12345678', name: 'Bob', inviteCode: TEST_INVITE_CODE });
      expect(r.status).toBe(400);
    }
    const real = readCode(email, 'register')!;
    const blocked = await request(app)
      .post('/api/auth/register')
      .send({ email, code: real, password: 'Aa12345678', name: 'Bob', inviteCode: TEST_INVITE_CODE });
    expect(blocked.status).toBe(429);
  });

  it('60 秒重发间隔会触发 429', async () => {
    const app = await getApp();
    await enableInviteCode();
    const email = 'carol@test.local';
    const r1 = await request(app).post('/api/auth/register-code').send({ email, inviteCode: TEST_INVITE_CODE });
    expect(r1.status).toBe(200);
    const r2 = await request(app).post('/api/auth/register-code').send({ email, inviteCode: TEST_INVITE_CODE });
    expect(r2.status).toBe(429);
  });

  it('邀请码错误时不能获取验证码或注册', async () => {
    const app = await getApp();
    await enableInviteCode();
    const email = 'invite@test.local';
    const invalidInvite = await request(app)
      .post('/api/auth/validate-invite')
      .send({ inviteCode: 'wrong' });
    expect(invalidInvite.status).toBe(403);
    expect(invalidInvite.body.code).toBe('INVALID_INVITE_CODE');

    const validInvite = await request(app)
      .post('/api/auth/validate-invite')
      .send({ inviteCode: TEST_INVITE_CODE });
    expect(validInvite.status).toBe(200);
    expect(validInvite.body.ok).toBe(true);

    const codeReq = await request(app)
      .post('/api/auth/register-code')
      .send({ email, inviteCode: 'wrong' });
    expect(codeReq.status).toBe(403);

    const register = await request(app)
      .post('/api/auth/register')
      .send({ email, code: '123456', password: 'Aa12345678', name: 'Invite', inviteCode: 'wrong' });
    expect(register.status).toBe(403);
  });
});

describe('Google 登录', () => {
  async function enableInviteCode() {
    await prisma.systemSetting.upsert({
      where: { key: 'register_invite_code' },
      update: { value: TEST_INVITE_CODE },
      create: { key: 'register_invite_code', value: TEST_INVITE_CODE },
    });
  }

  function mockGoogleProfile(profile: {
    email: string;
    name?: string;
    aud?: string;
    email_verified?: boolean | string;
    picture?: string;
  }) {
    env.GOOGLE_CLIENT_ID = 'test-google-client';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        aud: profile.aud ?? env.GOOGLE_CLIENT_ID,
        email: profile.email,
        email_verified: profile.email_verified ?? true,
        name: profile.name ?? 'Google User',
        picture: profile.picture ?? 'https://example.com/avatar.png',
        sub: 'google-sub',
      }),
    } as Response);
  }

  it('已有相同 email 的账号可直接使用 Google 登录', async () => {
    const app = await getApp();
    await enableInviteCode();
    const email = 'google-existing@test.local';
    await request(app).post('/api/auth/register-code').send({ email, inviteCode: TEST_INVITE_CODE });
    const code = readCode(email, 'register')!;
    const registered = await request(app)
      .post('/api/auth/register')
      .send({ email, code, password: 'Aa12345678', name: 'Old Name', inviteCode: TEST_INVITE_CODE });
    mockGoogleProfile({ email, name: 'Google Name' });

    const res = await request(app).post('/api/auth/google').send({ credential: 'google-token' });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(registered.body.user.id);
    expect(res.body.user.email).toBe(email);
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('新 Google 账号没有正确邀请码时不能注册', async () => {
    const app = await getApp();
    await enableInviteCode();
    mockGoogleProfile({ email: 'google-new@test.local' });

    const missing = await request(app).post('/api/auth/google').send({ credential: 'google-token' });
    expect(missing.status).toBe(403);
    expect(missing.body.code).toBe('INVALID_INVITE_CODE');

    const wrong = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'google-token', inviteCode: 'wrong' });
    expect(wrong.status).toBe(403);
    expect(wrong.body.code).toBe('INVALID_INVITE_CODE');
  });

  it('新 Google 账号带正确邀请码时会创建并登录', async () => {
    const app = await getApp();
    await enableInviteCode();
    const email = 'google-created@test.local';
    mockGoogleProfile({ email, name: 'Created By Google' });

    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'google-token', inviteCode: TEST_INVITE_CODE });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(true);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.name).toBe('Created By Google');
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerifiedAt).toBeTruthy();
    expect(await prisma.workspace.count({ where: { ownerId: user.id } })).toBe(1);
  });
});

describe('登录与退出', () => {
  it('注册后可登录，禁用后无法登录', async () => {
    const app = await getApp();
    await prisma.systemSetting.upsert({
      where: { key: 'register_invite_code' },
      update: { value: TEST_INVITE_CODE },
      create: { key: 'register_invite_code', value: TEST_INVITE_CODE },
    });
    const email = 'dave@test.local';
    await request(app).post('/api/auth/register-code').send({ email, inviteCode: TEST_INVITE_CODE });
    const code = readCode(email, 'register')!;
    await request(app)
      .post('/api/auth/register')
      .send({ email, code, password: 'Aa12345678', name: 'Dave', inviteCode: TEST_INVITE_CODE });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'Aa12345678' });
    expect(login.status).toBe(200);

    const bad = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'WrongPass1' });
    expect(bad.status).toBe(401);
  });
});
