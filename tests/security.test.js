import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const manifestPath = join(__dirname, '..', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
const contentCode = readFileSync(join(__dirname, '..', 'content.js'), 'utf-8');
const keyboardCode = readFileSync(join(__dirname, '..', 'keyboard.js'), 'utf-8');
const statsCode = readFileSync(join(__dirname, '..', 'stats.js'), 'utf-8');
const backgroundCode = readFileSync(join(__dirname, '..', 'background.js'), 'utf-8');

const allCode = [contentCode, keyboardCode, statsCode, backgroundCode];
const allCodeStr = allCode.join('\n');

describe('Security Audit', () => {
  describe('manifest.json permissions', () => {
    it('should use manifest_version 3', () => {
      expect(manifest.manifest_version).toBe(3);
    });

    it('should only request necessary permissions', () => {
      const allowed = ['storage', 'tabs'];
      expect(manifest.permissions).toEqual(expect.arrayContaining(allowed));
      expect(manifest.permissions.length).toBe(allowed.length);
    });

    it('should NOT request dangerous permissions', () => {
      const dangerous = [
        'webRequest', 'webRequestBlocking', 'debugger', 'cookies',
        'history', 'bookmarks', 'management', 'nativeMessaging',
        'proxy', 'privacy', 'downloads', '<all_urls>',
      ];
      for (const perm of dangerous) {
        expect(manifest.permissions).not.toContain(perm);
      }
    });

    it('should restrict host_permissions to Twitter/X only', () => {
      const hosts = manifest.host_permissions || [];
      for (const host of hosts) {
        expect(
          host.includes('twitter.com') || host.includes('x.com')
        ).toBe(true);
      }
    });

    it('should not have overly broad host permissions like <all_urls>', () => {
      const hosts = manifest.host_permissions || [];
      expect(hosts).not.toContain('<all_urls>');
      expect(hosts).not.toContain('*://*/*');
    });

    it('should only inject content scripts on Twitter/X domains', () => {
      for (const cs of manifest.content_scripts) {
        for (const match of cs.matches) {
          expect(
            match.includes('twitter.com') || match.includes('x.com')
          ).toBe(true);
        }
      }
    });

    it('should not define externally_connectable', () => {
      expect(manifest.externally_connectable).toBeUndefined();
    });

    it('should not define web_accessible_resources', () => {
      if (manifest.web_accessible_resources) {
        for (const resource of manifest.web_accessible_resources) {
          if (resource.matches) {
            for (const match of resource.matches) {
              expect(
                match.includes('twitter.com') || match.includes('x.com')
              ).toBe(true);
            }
          }
        }
      }
    });
  });

  describe('XSS prevention', () => {
    it('should NOT use eval() in any source files', () => {
      for (const code of allCode) {
        const lines = code.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
        for (const line of lines) {
          expect(line).not.toMatch(/\beval\s*\(/);
        }
      }
    });

    it('should NOT use Function constructor', () => {
      for (const code of allCode) {
        const lines = code.split('\n').filter(l => !l.trim().startsWith('//'));
        for (const line of lines) {
          expect(line).not.toMatch(/new\s+Function\s*\(/);
        }
      }
    });

    it('should NOT use document.write', () => {
      expect(allCodeStr).not.toMatch(/document\.write\s*\(/);
    });

    it('should use escapeHtml for user-controlled data in notifications', () => {
      expect(contentCode).toContain('function escapeHtml(text)');
      expect(contentCode).toContain('div.textContent = text');
      expect(contentCode).toContain('div.innerHTML');
      expect(contentCode).toContain('escapeHtml(data.contentPreview)');
      expect(contentCode).toContain('escapeHtml(displayName)');
    });

    it('should NOT use innerHTML with unsanitized user data in stats widget', () => {
      expect(contentCode).toContain('time24h.textContent = timeStats.last24h');
      expect(contentCode).toContain('time7d.textContent = timeStats.last7d');
      expect(contentCode).toContain("tweets24h.textContent = `${tweetCounts.last24h} tweets`");
    });

    it('should use encodeURIComponent for search queries', () => {
      expect(keyboardCode).toContain('encodeURIComponent(input.value.trim())');
    });
  });

  describe('innerHTML audit - XSS risk assessment', () => {
    it('FIXED: bookmark card now escapes all user-controlled data via escapeHtml', () => {
      expect(contentCode).toContain('escapeHtml(bookmark.avatar)');
      expect(contentCode).toContain('escapeHtml(bookmark.username)');
      expect(contentCode).toContain('escapeHtml(bookmark.text)');
      expect(contentCode).toContain('escapeHtml(bookmark.time)');
    });

    it('FIXED: notification avatar uses JS error handler instead of inline onerror', () => {
      expect(contentCode).not.toContain('onerror=');
      expect(contentCode).toContain("addEventListener('error'");
    });
  });

  describe('input validation', () => {
    it('FIXED: keyboard isTyping guards against null/non-element targets', () => {
      expect(keyboardCode).toContain('if (!element || !element.tagName) return false');
    });
  });

  describe('data leakage', () => {
    it('should NOT send data to external servers', () => {
      for (const code of allCode) {
        expect(code).not.toMatch(/fetch\s*\(/);
        expect(code).not.toMatch(/XMLHttpRequest/);
        expect(code).not.toMatch(/navigator\.sendBeacon/);
        expect(code).not.toMatch(/new\s+WebSocket/);
      }
    });

    it('should only store data in chrome.storage.local (not sync)', () => {
      expect(allCodeStr).toContain('chrome.storage.local');
      expect(allCodeStr).not.toContain('chrome.storage.sync');
    });

    it('should not access cookies or localStorage for sensitive data', () => {
      for (const code of allCode) {
        expect(code).not.toMatch(/document\.cookie/);
      }
    });

    it('should not read or exfiltrate Twitter auth tokens', () => {
      for (const code of allCode) {
        expect(code).not.toMatch(/auth_token/i);
        expect(code).not.toMatch(/bearer/i);
        expect(code).not.toMatch(/csrf/i);
        expect(code).not.toMatch(/ct0/);
      }
    });
  });

  describe('CSP compliance', () => {
    it('should not use inline styles via setAttribute for script execution', () => {
      for (const code of allCode) {
        const lines = code.split('\n');
        for (const line of lines) {
          if (line.includes('setAttribute') && line.includes('style')) {
            expect(line).not.toContain('javascript:');
          }
        }
      }
    });

    it('should not inject script tags', () => {
      for (const code of allCode) {
        expect(code).not.toMatch(/<script[\s>]/i);
      }
    });

    it('should not use javascript: protocol URLs', () => {
      for (const code of allCode) {
        expect(code).not.toMatch(/javascript:/i);
      }
    });
  });

  describe('URL validation', () => {
    it('background.js openTabs relies on manifest host_permissions for restriction', () => {
      expect(backgroundCode).toContain("message.urls || []");
    });

    it('search should use encodeURIComponent to prevent URL injection', () => {
      expect(keyboardCode).toContain('encodeURIComponent');
    });

    it('navigation URLs should be hardcoded to x.com', () => {
      expect(keyboardCode).toContain('https://x.com/diegooprime');
      expect(contentCode).toContain('https://x.com');
    });
  });
});
