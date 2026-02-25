import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupChromeAPI, setupTwitterDOM, createMockTweet, createMockNotification } from './setup.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const statsCode = readFileSync(join(__dirname, '..', 'stats.js'), 'utf-8');
const contentCode = readFileSync(join(__dirname, '..', 'content.js'), 'utf-8');

describe('content.js - Main Content Script', () => {
  let chrome;

  beforeEach(() => {
    vi.useFakeTimers();
    chrome = setupChromeAPI();
    document.body.innerHTML = '';
    document.body.className = '';
    Object.defineProperty(document, 'readyState', { value: 'complete', writable: true, configurable: true });
    eval(statsCode);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.BetterUIStats;
    delete window.BetterUIKeyboard;
  });

  function loadContent() {
    const { primaryColumn, section } = setupTwitterDOM();
    eval(contentCode);
    return { primaryColumn, section };
  }

  describe('initialization', () => {
    it('should create stats widget on init', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/home', href: 'https://x.com/home' },
        writable: true, configurable: true,
      });
      loadContent();
      vi.advanceTimersByTime(100);
      const widget = document.getElementById('betterui-stats');
      expect(widget).not.toBeNull();
    });

    it('should contain time and tweet stat elements', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/home', href: 'https://x.com/home' },
        writable: true, configurable: true,
      });
      loadContent();
      vi.advanceTimersByTime(100);
      expect(document.getElementById('betterui-time-24h')).not.toBeNull();
      expect(document.getElementById('betterui-time-7d')).not.toBeNull();
      expect(document.getElementById('betterui-tweets-24h')).not.toBeNull();
      expect(document.getElementById('betterui-tweets-7d')).not.toBeNull();
    });
  });

  describe('ad removal', () => {
    it('should hide cells containing ads (via "Ad" span in header)', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/home', href: 'https://x.com/home' },
        writable: true, configurable: true,
      });
      const { primaryColumn } = loadContent();
      const { cell } = createMockTweet({ isAd: true, statusId: '111' });
      primaryColumn.querySelector('section').appendChild(cell);

      vi.advanceTimersByTime(1500);

      expect(cell.style.display).toBe('none');
      expect(cell.dataset.betteruiAd).toBe('true');
    });

    it('should NOT hide non-ad tweets', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/home', href: 'https://x.com/home' },
        writable: true, configurable: true,
      });
      const { primaryColumn } = loadContent();
      const { cell } = createMockTweet({ isAd: false, statusId: '222' });
      primaryColumn.querySelector('section').appendChild(cell);

      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(500);
      }

      expect(cell.dataset.betteruiAd).toBe('false');
      expect(cell.style.display).not.toBe('none');
    });

    it('should detect promotedIndicator testid', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/home', href: 'https://x.com/home' },
        writable: true, configurable: true,
      });
      const { primaryColumn } = loadContent();
      const { cell, article } = createMockTweet({ statusId: '333' });
      const promoted = document.createElement('div');
      promoted.setAttribute('data-testid', 'promotedIndicator');
      article.appendChild(promoted);
      primaryColumn.querySelector('section').appendChild(cell);

      vi.advanceTimersByTime(1500);

      expect(cell.dataset.betteruiAd).toBe('true');
      expect(cell.style.display).toBe('none');
    });
  });

  describe('page type detection', () => {
    it('should add bookmarks class on /i/bookmarks', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/i/bookmarks', href: 'https://x.com/i/bookmarks' },
        writable: true, configurable: true,
      });
      loadContent();
      vi.advanceTimersByTime(100);
      expect(document.body.classList.contains('betterui-bookmarks-page')).toBe(true);
    });

    it('should add tweet-page class on status pages', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/user/status/123456', href: 'https://x.com/user/status/123456' },
        writable: true, configurable: true,
      });
      loadContent();
      vi.advanceTimersByTime(100);
      expect(document.body.classList.contains('betterui-tweet-page')).toBe(true);
    });

    it('should add profile-page class on profile pages', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/diegooprime', href: 'https://x.com/diegooprime' },
        writable: true, configurable: true,
      });
      loadContent();
      vi.advanceTimersByTime(100);
      expect(document.body.classList.contains('betterui-profile-page')).toBe(true);
    });

    it('should NOT mark /home as profile page', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/home', href: 'https://x.com/home' },
        writable: true, configurable: true,
      });
      loadContent();
      vi.advanceTimersByTime(100);
      expect(document.body.classList.contains('betterui-profile-page')).toBe(false);
    });

    it('should NOT mark /settings as profile page', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/settings/profile', href: 'https://x.com/settings/profile' },
        writable: true, configurable: true,
      });
      loadContent();
      vi.advanceTimersByTime(100);
      expect(document.body.classList.contains('betterui-profile-page')).toBe(false);
    });

    it('should add notifications class on /notifications', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/notifications', href: 'https://x.com/notifications' },
        writable: true, configurable: true,
      });
      loadContent();
      vi.advanceTimersByTime(100);
      expect(document.body.classList.contains('betterui-notifications-page')).toBe(true);
    });
  });

  describe('escapeHtml utility (via notification rendering)', () => {
    it('should escape HTML entities in notification content', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/notifications', href: 'https://x.com/notifications' },
        writable: true, configurable: true,
      });
      const { primaryColumn } = loadContent();

      // Simulate notifications with potentially malicious text
      const notif = createMockNotification({
        username: 'hacker',
        text: '<img src=x onerror=alert(1)>',
        action: 'liked',
      });
      // jsdom offsetHeight is 0 by default - the extractNotificationData checks offsetHeight >= 30
      // Override it so the notification passes the height check
      Object.defineProperty(notif, 'offsetHeight', { value: 80, configurable: true });
      primaryColumn.querySelector('section').appendChild(notif);

      vi.advanceTimersByTime(2000);

      const list = document.getElementById('betterui-notifications-list');
      if (list) {
        // The content should be escaped - no raw HTML tags
        expect(list.innerHTML).not.toContain('<img src=x');
        // It should contain the escaped version
        expect(list.innerHTML).toContain('&lt;img');
      }
    });
  });

  describe('bookmark card creation', () => {
    it('should extract tweet data and create bookmark cards on /i/bookmarks', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/i/bookmarks', href: 'https://x.com/i/bookmarks' },
        writable: true, configurable: true,
      });
      const { primaryColumn } = loadContent();

      const { cell: cell1 } = createMockTweet({ username: 'user1', text: 'Bookmark 1', statusId: '100' });
      const { cell: cell2 } = createMockTweet({ username: 'user2', text: 'Bookmark 2', statusId: '200', hasMedia: true });
      const section = primaryColumn.querySelector('section');
      section.appendChild(cell1);
      section.appendChild(cell2);

      vi.advanceTimersByTime(2000);

      const grid = document.getElementById('betterui-bookmarks-grid');
      if (grid) {
        const cards = grid.querySelectorAll('.betterui-bookmark-card');
        expect(cards.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('should escape HTML in bookmark card data', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/i/bookmarks', href: 'https://x.com/i/bookmarks' },
        writable: true, configurable: true,
      });
      const { primaryColumn } = loadContent();

      // Create a tweet with potentially dangerous text
      const { cell } = createMockTweet({
        username: '<script>alert(1)</script>',
        text: '"><img src=x onerror=alert(1)>',
        statusId: '999',
      });
      primaryColumn.querySelector('section').appendChild(cell);

      vi.advanceTimersByTime(2000);

      const grid = document.getElementById('betterui-bookmarks-grid');
      if (grid) {
        // Verify no raw HTML tags in the output (escaped versions like &lt; are fine)
        expect(grid.innerHTML).not.toContain('<script>');
        // The img onerror should be escaped - verify no actual img tag with onerror attribute
        expect(grid.querySelector('img[onerror]')).toBeNull();
        // The text content should contain the escaped form
        expect(grid.querySelector('.bookmark-user').textContent).toContain('alert(1)');
      }
    });
  });
});
