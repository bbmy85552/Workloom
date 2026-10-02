import { describe, expect, it } from 'vitest';
import { FOLDER_CONTENT, isFolderContent } from '../src/lib/folder.js';
import { decryptSecret, encryptSecret } from '../src/lib/crypto.js';

describe('persisted data compatibility after the Workloom rename', () => {
  it('recognizes saved folders while writing the current marker', () => {
    expect(FOLDER_CONTENT).toBe('<div data-workloom-type="folder"></div>');
    expect(isFolderContent(FOLDER_CONTENT)).toBe(true);
    expect(isFolderContent('<div data-jianji-type="folder"></div>')).toBe(true);
    expect(isFolderContent('<p>A normal document</p>')).toBe(false);
  });

  it('decrypts an existing mail credential and round-trips new credentials', () => {
    const existing = 'BwcHBwcHBwcHBwcH.wGIjWS0Md6taMD5LKlo-5A.GK9SLiq0DYr5f8m9t_sC8oOU_XU';
    expect(decryptSecret(existing)).toBe('stored-mail-password');
    expect(decryptSecret(encryptSecret('new-mail-password'))).toBe('new-mail-password');
  });
});
