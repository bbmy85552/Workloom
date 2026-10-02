import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { getApp, registerUser, resetData } from './helpers.js';

beforeAll(async () => {
  await getApp();
});

afterEach(async () => {
  await resetData();
});

describe('登录设备管理', () => {
  it('accepts the previous session cookie and revokes it on logout', async () => {
    const app = await getApp();
    const { cookie } = await registerUser('legacy-session@test.local', 'Existing User');
    const currentCookie = cookie.find((value) => value.startsWith('workloom_session='));
    expect(currentCookie).toBeTruthy();
    const legacyCookie = currentCookie!.split(';')[0].replace('workloom_session=', 'jianji_session=');
    await request(app).get('/api/auth/me').set('Cookie', legacyCookie).expect(200);
    const logout = await request(app).post('/api/auth/logout').set('Cookie', legacyCookie).expect(200);
    expect(logout.headers['set-cookie'].join(' ')).toContain('workloom_session=;');
    expect(logout.headers['set-cookie'].join(' ')).toContain('jianji_session=;');
    await request(app).get('/api/auth/me').set('Cookie', legacyCookie).expect(401);
  });

  it('登录后会话列表包含当前设备', async () => {
    const app = await getApp();
    const { cookie } = await registerUser('s1@test.local', 'S1');
    const r = await request(app)
      .get('/api/me/sessions')
      .set('User-Agent', 'TestAgent/1.0 (Test)')
      .set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.sessions)).toBe(true);
    expect(r.body.sessions.length).toBeGreaterThanOrEqual(1);
    expect(r.body.sessions[0].isCurrent).toBe(true);
    expect(r.body.currentId).toBeTruthy();
  });

  it('可以注销其他设备而保留本机会话', async () => {
    const app = await getApp();
    await registerUser('s2@test.local', 'S2');

    // 第二次登录形成另一个会话
    const second = await request(app)
      .post('/api/auth/login')
      .set('User-Agent', 'OtherAgent/2.0')
      .send({ email: 's2@test.local', password: 'Aa12345678' });
    const cookie2 = second.headers['set-cookie'] as unknown as string[];

    // 用 cookie2 看到两个会话
    const list = await request(app).get('/api/me/sessions').set('Cookie', cookie2);
    expect(list.body.sessions.length).toBeGreaterThanOrEqual(2);

    // 注销其他
    const del = await request(app).delete('/api/me/sessions/others').set('Cookie', cookie2);
    expect(del.status).toBe(200);
    expect(del.body.revoked).toBeGreaterThanOrEqual(1);

    const after = await request(app).get('/api/me/sessions').set('Cookie', cookie2);
    expect(after.status).toBe(200);
    const active = after.body.sessions.filter((s: any) => s.isActive);
    expect(active.length).toBe(1);
    expect(active[0].isCurrent).toBe(true);
    expect(after.body.sessions.some((s: any) => s.revokedAt)).toBe(true);
  });

  it('被撤销的会话再次访问 API 时应被拒绝', async () => {
    const app = await getApp();
    await registerUser('s3@test.local', 'S3');

    const first = await request(app)
      .post('/api/auth/login')
      .send({ email: 's3@test.local', password: 'Aa12345678' });
    const cookie1 = first.headers['set-cookie'] as unknown as string[];

    const second = await request(app)
      .post('/api/auth/login')
      .send({ email: 's3@test.local', password: 'Aa12345678' });
    const cookie2 = second.headers['set-cookie'] as unknown as string[];

    // 用 cookie2 列出会话,找出 cookie1 对应的会话 id
    const list = await request(app).get('/api/me/sessions').set('Cookie', cookie2);
    const otherSession = list.body.sessions.find((s: any) => !s.isCurrent);
    expect(otherSession).toBeTruthy();

    const del = await request(app)
      .delete(`/api/me/sessions/${otherSession.id}`)
      .set('Cookie', cookie2);
    expect(del.status).toBe(200);

    const after = await request(app).get('/api/me/sessions').set('Cookie', cookie2);
    const revoked = after.body.sessions.find((s: any) => s.id === otherSession.id);
    expect(revoked?.revokedAt).toBeTruthy();
    expect(revoked?.isActive).toBe(false);
    expect(revoked?.tokenHash).toBeUndefined();

    // 用被撤销的 cookie1 访问应该 401
    const denied = await request(app).get('/api/auth/me').set('Cookie', cookie1);
    expect(denied.status).toBe(401);
    expect(denied.body.code).toBe('SESSION_REVOKED');
  });

  it('禁止通过 DELETE :id 撤销当前会话', async () => {
    const app = await getApp();
    const { cookie } = await registerUser('s4@test.local', 'S4');
    const list = await request(app).get('/api/me/sessions').set('Cookie', cookie);
    const currentId = list.body.currentId as string;
    const r = await request(app).delete(`/api/me/sessions/${currentId}`).set('Cookie', cookie);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('CANNOT_REVOKE_SELF');
  });

  it('登出后该会话失效', async () => {
    const app = await getApp();
    const { cookie } = await registerUser('s5@test.local', 'S5');
    const out = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(200);
    const denied = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(denied.status).toBe(401);
  });
});
