import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupChromeAPI, setupTwitterDOM, createMockTweet, createMockNotification } from './setup.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const statsCode = readFileSync(join(__dirname, '..', 'stats.js'), 'utf-8');
const keyboardCode = readFileSync(join(__dirname, '..', 'keyboard.js'), 'utf-8');
const contentCode = readFileSync(join(__dirname, '..', 'content.js'), 'utf-8');

function pressKey(key, opts = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
  document.body.dispatchEvent(event);
}

describe('Integration: Full Extension Flow', () => {
  let chrome;

  beforeEach(() => {
    vi.useFakeTimers();
    chrome = setupChromeAPI();
    document.body.innerHTML = '';
    document.body.className = '';
    Object.defineProperty(document, 'readyState', { value: 'complete', writable: true, configurable: true });
    Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.BetterUIStats;
    delete window.BetterUIKeyboard;
  });

  function loadAllModules() {
    const { primaryColumn, section } = setupTwitterDOM();
    eval(statsCode);
    eval(keyboardCode);
    eval(contentCode);
    return { primaryColumn, section };
  }

  describe('home page flow', () => {
    it('should initialize all modules on home page', async () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/home', href: 'https://x.com/home' },
        writable: true, configurable: true,
      });

      loadAllModules();
      // Allow async init (loadStats) to settle
      await vi.advanceTimersByTimeAsync(1000);

      expect(document.getElementById('betterui-stats')).not.toBeNull();
      expect(chrome.storage.local.get).toHaveBeenCalled();
      expect(window.BetterUIKeyboard).toBeDefined();
    });

    it('should track time after initialization', async () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/home', href: 'https://x.com/home' },
        writable: true, configurable: true,
      });

      loadAllModules();
      // Let async init complete
      await vi.advanceTimersByTimeAsync(100);
      // Then advance time for tracking
      vi.advanceTimersByTime(5000);

      const stats = window.BetterUIStats.getTimeStats();
      expect(stats.last24hRaw).toBeGreaterThan(0);
    });

    it('should navigate tweets with keyboard after init', async () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/home', href: 'https://x.com/home' },
        writable: true, configurable: true,
      });

      const { primaryColumn } = loadAllModules();
      await vi.advanceTimersByTimeAsync(500);

      const section = primaryColumn.querySelector('section');
      const { cell: c1, article: a1 } = createMockTweet({ statusId: 'i1', text: 'First' });
      const { cell: c2, article: a2 } = createMockTweet({ statusId: 'i2', text: 'Second' });
      section.appendChild(c1);
      section.appendChild(c2);

      a1.getBoundingClientRect = () => ({ top: 100, bottom: 300, height: 200, left: 0, right: 600, width: 600 });
      a2.getBoundingClientRect = () => ({ top: 300, bottom: 500, height: 200, left: 0, right: 600, width: 600 });

      pressKey('j');
      vi.advanceTimersByTime(10);
      expect(document.querySelectorAll('.betterui-focused').length).toBe(1);

      pressKey('j');
      vi.advanceTimersByTime(10);
      expect(document.querySelectorAll('.betterui-focused').length).toBe(1);
    });
  });

  describe('ad removal + stats widget integration', () => {
    it('should remove ads while keeping stats widget visible', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/home', href: 'https://x.com/home' },
        writable: true, configurable: true,
      });

      const { primaryColumn } = loadAllModules();
      vi.advanceTimersByTime(200);

      const section = primaryColumn.querySelector('section');
      const { cell: adCell } = createMockTweet({ isAd: true, statusId: 'ad1' });
      const { cell: normalCell } = createMockTweet({ isAd: false, statusId: 'normal1' });
      section.appendChild(adCell);
      section.appendChild(normalCell);

      vi.advanceTimersByTime(2000);

      expect(adCell.dataset.betteruiAd).toBe('true');
      expect(adCell.style.display).toBe('none');
      expect(document.getElementById('betterui-stats')).not.toBeNull();
    });
  });

  describe('notifications page integration', () => {
    it('should add notifications page class and build list structure', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/notifications', href: 'https://x.com/notifications' },
        writable: true, configurable: true,
      });

      const { primaryColumn } = loadAllModules();
      vi.advanceTimersByTime(200);

      const section = primaryColumn.querySelector('section');
      const n1 = createMockNotification({ username: 'alice', action: 'liked', text: 'Nice work!' });
      const n2 = createMockNotification({ username: 'bob', action: 'retweeted', text: 'Shared this' });
      Object.defineProperty(n1, 'offsetHeight', { value: 80, configurable: true });
      Object.defineProperty(n2, 'offsetHeight', { value: 80, configurable: true });
      section.appendChild(n1);
      section.appendChild(n2);

      vi.advanceTimersByTime(2000);

      expect(document.body.classList.contains('betterui-notifications-page')).toBe(true);
    });
  });

  describe('bookmarks page integration', () => {
    it('should build bookmarks grid when tweets are present', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/i/bookmarks', href: 'https://x.com/i/bookmarks' },
        writable: true, configurable: true,
      });

      const { primaryColumn } = loadAllModules();
      vi.advanceTimersByTime(200);

      const section = primaryColumn.querySelector('section');
      const { cell: b1 } = createMockTweet({ username: 'bm_user1', text: 'Bookmarked 1', statusId: 'bm1' });
      const { cell: b2 } = createMockTweet({ username: 'bm_user2', text: 'Bookmarked 2', statusId: 'bm2' });
      section.appendChild(b1);
      section.appendChild(b2);

      vi.advanceTimersByTime(2000);

      expect(document.body.classList.contains('betterui-bookmarks-page')).toBe(true);
    });
  });

  describe('profile page integration', () => {
    it('should build profile tabs on profile page', () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/diegooprime', href: 'https://x.com/diegooprime' },
        writable: true, configurable: true,
      });

      loadAllModules();
      vi.advanceTimersByTime(2000);

      expect(document.body.classList.contains('betterui-profile-page')).toBe(true);
      const tabs = document.getElementById('betterui-profile-tabs');
      if (tabs) {
        const buttons = tabs.querySelectorAll('button');
        expect(buttons.length).toBe(4);
      }
    });
  });

  describe('leader key + navigation integration', () => {
    it('should activate leader and handle chord sequences', async () => {
      Object.defineProperty(window, 'location', {
        value: { pathname: '/home', href: 'https://x.com/home' },
        writable: true, configurable: true,
      });

      loadAllModules();
      await vi.advanceTimersByTimeAsync(500);

      // Leader -> ? should show help
      pressKey(' ');
      vi.advanceTimersByTime(10);
      pressKey('?');
      vi.advanceTimersByTime(10);

      const helpOverlay = document.getElementById('betterui-help-overlay');
      expect(helpOverlay).not.toBeNull();
    });
  });
});
