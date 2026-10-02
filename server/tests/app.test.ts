import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { getApp } from './helpers.js';

beforeAll(async () => {
  await getApp();
});

describe('应用安全与部署适配', () => {
  it('CORS 允许反向代理后的同 Host Origin', async () => {
    const app = await getApp();
    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'https://workloom.example.com')
      .set('Host', 'workloom.example.com')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.headers['access-control-allow-origin']).toBe('https://workloom.example.com');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('CORS 拒绝非允许且非同 Host Origin', async () => {
    const app = await getApp();
    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'https://evil.example.com')
      .set('Host', 'workloom.example.com')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
