import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const suffixes = ['LATEST_VERSION', 'CURRENT_COMMIT', 'UPDATE_REPO', 'UPDATE_BRANCH', 'UPDATE_CHECK_URL', 'UPDATE_COMMAND'];

beforeEach(() => {
  vi.resetModules();
  for (const suffix of suffixes) {
    vi.stubEnv(`WORKLOOM_${suffix}`, undefined);
    vi.stubEnv(`JIANJI_${suffix}`, undefined);
  }
  vi.stubEnv('COOKIE_NAME', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Workloom environment settings', () => {
  it('uses the current repository and cookie defaults', async () => {
    const { env } = await import('../src/env.js');
    expect(env.WORKLOOM_UPDATE_REPO).toBe('https://github.com/bbmy85552/Workloom.git');
    expect(env.WORKLOOM_UPDATE_CHECK_URL).toBe('https://api.github.com/repos/bbmy85552/Workloom/commits/main');
    expect(env.COOKIE_NAME).toBe('workloom_session');
  });

  it('reads legacy settings but gives current names precedence', async () => {
    vi.stubEnv('JIANJI_UPDATE_REPO', 'https://example.com/custom.git');
    vi.stubEnv('JIANJI_CURRENT_COMMIT', 'legacy-commit');
    vi.stubEnv('JIANJI_UPDATE_COMMAND', 'legacy-updater');
    vi.stubEnv('WORKLOOM_CURRENT_COMMIT', 'current-commit');
    vi.stubEnv('WORKLOOM_UPDATE_COMMAND', '');
    const { env } = await import('../src/env.js');
    expect(env.WORKLOOM_UPDATE_REPO).toBe('https://example.com/custom.git');
    expect(env.WORKLOOM_CURRENT_COMMIT).toBe('current-commit');
    expect(env.WORKLOOM_UPDATE_COMMAND).toBe('');
  });

  it('upgrades the historical upstream defaults instead of fetching that repository', async () => {
    vi.stubEnv('JIANJI_UPDATE_REPO', 'https://github.com/staklab/jianji.git');
    vi.stubEnv('JIANJI_UPDATE_CHECK_URL', 'https://api.github.com/repos/staklab/jianji/commits/main');
    const { env } = await import('../src/env.js');
    expect(env.WORKLOOM_UPDATE_REPO).toBe('https://github.com/bbmy85552/Workloom.git');
    expect(env.WORKLOOM_UPDATE_CHECK_URL).toBe('https://api.github.com/repos/bbmy85552/Workloom/commits/main');
  });
});
