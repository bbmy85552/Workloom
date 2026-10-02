import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readBrowserValue, writeBrowserValue } from '../src/lib/browserStorage.ts';
import { clearRememberedLogin, readRememberedLogin, saveRememberedLogin } from '../src/lib/rememberedLogin.ts';

const originalWindow = globalThis.window;
afterEach(() => {
  if (originalWindow) globalThis.window = originalWindow;
  else delete (globalThis as { window?: Window }).window;
});

function mockStorage(entries: Record<string, string>) {
  const values = new Map(Object.entries(entries));
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  } as unknown as Window & typeof globalThis;
  return values;
}

test('existing preferences survive the rename, and new choices take precedence', () => {
  const values = mockStorage({ 'jianji.language': 'en' });
  assert.equal(readBrowserValue('workloom.language', 'jianji.language'), 'en');
  writeBrowserValue('workloom.language', 'zh-CN', 'jianji.language');
  assert.equal(readBrowserValue('workloom.language', 'jianji.language'), 'zh-CN');
  assert.equal(values.has('jianji.language'), false);
});

test('remembered login preserves only the email and clearing also removes legacy data', () => {
  const values = mockStorage({
    'jianji.rememberedLogin.v1': JSON.stringify({ email: 'demo@example.com', password: 'old-secret' }),
  });
  assert.deepEqual(readRememberedLogin(), { email: 'demo@example.com' });
  saveRememberedLogin(readRememberedLogin()!);
  assert.equal(values.get('workloom.rememberedLogin.v1'), '{"email":"demo@example.com"}');
  assert.equal(values.has('jianji.rememberedLogin.v1'), false);
  values.set('jianji.rememberedLogin.v1', '{"email":"stale@example.com"}');
  clearRememberedLogin();
  assert.equal(readRememberedLogin(), null);
});

test('disabled browser storage does not prevent startup', () => {
  globalThis.window = {
    get localStorage() { throw new Error('Storage disabled'); },
  } as unknown as Window & typeof globalThis;
  assert.equal(readBrowserValue('workloom.language', 'jianji.language'), null);
  assert.doesNotThrow(() => writeBrowserValue('workloom.language', 'en', 'jianji.language'));
});
