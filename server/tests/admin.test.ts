import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { getApp, loginAdmin, registerUser, resetData } from './helpers.js';

beforeAll(async () => {
  await getApp();
});

afterEach(async () => {
  await resetData();
});

describe('管理后台', () => {
  it('normalizes historical default brands while preserving custom company names', async () => {
    const app = await getApp();
    const { cookie } = await loginAdmin();
    for (const previousBrand of ['文档中心', '简记', 'Jianji']) {
      await request(app)
        .put('/api/admin/settings')
        .set('Cookie', cookie)
        .send({ brand_name: previousBrand, company_name: 'My Company' })
        .expect(200);
      const publicSettings = await request(app).get('/api/public/settings');
      expect(publicSettings.body.brandName).toBe('Workloom');
      expect(publicSettings.body.companyName).toBe('My Company');
      const adminSettings = await request(app).get('/api/admin/settings').set('Cookie', cookie);
      expect(adminSettings.body.settings.brand_name).toBe('Workloom');
      expect(adminSettings.body.settings.company_name).toBe('My Company');
    }
  });

  it('管理员可以禁用用户，禁用后不可登录', async () => {
    const app = await getApp();
    const { cookie: userCookie } = await registerUser('victim@test.local', 'Victim');
    const { cookie: adminCookie } = await loginAdmin();

    const list = await request(app).get('/api/admin/users').set('Cookie', adminCookie);
    expect(list.status).toBe(200);
    const target = list.body.list.find((u: any) => u.email === 'victim@test.local');
    expect(target).toBeTruthy();

    const disabled = await request(app)
      .patch(`/api/admin/users/${target.id}`)
      .set('Cookie', adminCookie)
      .send({ status: 'DISABLED' });
    expect(disabled.status).toBe(200);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'victim@test.local', password: 'Aa12345678' });
    expect(login.status).toBe(403);

    const ping = await request(app).get('/api/auth/me').set('Cookie', userCookie);
    expect(ping.status).toBe(403);
  });

  it('普通用户访问 admin 接口被拒', async () => {
    const app = await getApp();
    const { cookie } = await registerUser('plain@test.local', 'Plain');
    const r = await request(app).get('/api/admin/users').set('Cookie', cookie);
    expect(r.status).toBe(403);
  });

  it('管理员可以触发更新维护通知，未配置自动命令时进入手动模式', async () => {
    const app = await getApp();
    const { cookie: userCookie } = await registerUser('update-user@test.local', 'UpdateUser');
    const { cookie: adminCookie } = await loginAdmin();

    const status = await request(app).get('/api/admin/update/status').set('Cookie', adminCookie);
    expect(status.status).toBe(200);
    expect(status.body.currentVersion).toBeTruthy();

    await request(app)
      .put('/api/admin/settings')
      .set('Cookie', adminCookie)
      .send({ latest_version: '0.2.0' });
    const newer = await request(app).get('/api/admin/update/status').set('Cookie', adminCookie);
    expect(newer.status).toBe(200);
    expect(newer.body.latestVersion).toBe('0.2.0');
    expect(newer.body.hasUpdate).toBe(true);

    const started = await request(app)
      .post('/api/admin/update/start')
      .set('Cookie', adminCookie)
      .send({ latestVersion: '0.2.0' });
    expect(started.status).toBe(200);
    expect(started.body.mode).toBe('manual');

    const notifications = await request(app)
      .get('/api/notifications')
      .set('Cookie', userCookie);
    expect(notifications.status).toBe(200);
    expect(notifications.body.list[0].title).toBe('Workloom 正在更新');

    const finished = await request(app)
      .post('/api/admin/update/finish')
      .set('Cookie', adminCookie)
      .send({});
    expect(finished.status).toBe(200);

    const after = await request(app).get('/api/notifications').set('Cookie', userCookie);
    expect(after.body.list[0].title).toBe('Workloom 已更新完毕');
  });
});
