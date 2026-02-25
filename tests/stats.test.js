import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupChromeAPI } from './setup.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const statsCode = readFileSync(join(__dirname, '..', 'stats.js'), 'utf-8');

describe('stats.js - BetterUIStats Module', () => {
  let chrome;

  beforeEach(() => {
    vi.useFakeTimers();
    chrome = setupChromeAPI();
    document.body.innerHTML = '';
    // Evaluate stats module, which sets window.BetterUIStats
    eval(statsCode);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.BetterUIStats;
  });

  it('should expose BetterUIStats on window', () => {
    expect(window.BetterUIStats).toBeDefined();
    expect(typeof window.BetterUIStats.init).toBe('function');
    expect(typeof window.BetterUIStats.getTimeStats).toBe('function');
    expect(typeof window.BetterUIStats.getScrolledTweetsCount).toBe('function');
    expect(typeof window.BetterUIStats.trackEngagement).toBe('function');
    expect(typeof window.BetterUIStats.getTweetId).toBe('function');
  });

  describe('getTimeStats', () => {
    it('should return formatted time stats with zero initial values', () => {
      const stats = window.BetterUIStats.getTimeStats();
      expect(stats).toHaveProperty('last24h');
      expect(stats).toHaveProperty('last7d');
      expect(stats).toHaveProperty('last24hRaw');
      expect(stats).toHaveProperty('last7dRaw');
      expect(stats.last24hRaw).toBe(0);
      expect(stats.last7dRaw).toBe(0);
    });
  });

  describe('getScrolledTweetsCount', () => {
    it('should return zero counts initially', () => {
      const counts = window.BetterUIStats.getScrolledTweetsCount();
      expect(counts.last24h).toBe(0);
      expect(counts.last7d).toBe(0);
    });
  });

  describe('getTweetId', () => {
    it('should extract status ID from tweet link', () => {
      const tweet = document.createElement('article');
      const link = document.createElement('a');
      link.href = 'https://x.com/user/status/12345678';
      tweet.appendChild(link);

      const id = window.BetterUIStats.getTweetId(tweet);
      expect(id).toBe('12345678');
    });

    it('should fallback to time datetime attribute', () => {
      const tweet = document.createElement('article');
      const time = document.createElement('time');
      time.setAttribute('datetime', '2024-01-01T00:00:00Z');
      tweet.appendChild(time);

      const id = window.BetterUIStats.getTweetId(tweet);
      expect(id).toBe('2024-01-01T00:00:00Z');
    });

    it('should return null when no identifiers found', () => {
      const tweet = document.createElement('article');
      const id = window.BetterUIStats.getTweetId(tweet);
      expect(id).toBeNull();
    });
  });

  describe('trackEngagement', () => {
    it('should not throw when tracking a tweet ID', () => {
      expect(() => window.BetterUIStats.trackEngagement('12345')).not.toThrow();
    });

    it('should handle null gracefully', () => {
      expect(() => window.BetterUIStats.trackEngagement(null)).not.toThrow();
    });
  });

  describe('init', () => {
    it('should call chrome.storage.local.get on init', async () => {
      await window.BetterUIStats.init();
      expect(chrome.storage.local.get).toHaveBeenCalledWith('betterui_stats');
    });

    it('should register beforeunload handler', async () => {
      const addEventSpy = vi.spyOn(window, 'addEventListener');
      await window.BetterUIStats.init();
      expect(addEventSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
      addEventSpy.mockRestore();
    });
  });

  describe('time formatting', () => {
    it('should format seconds correctly', async () => {
      await window.BetterUIStats.init();
      // Advance time by 30 seconds with active tab
      Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
      vi.advanceTimersByTime(30000);

      const stats = window.BetterUIStats.getTimeStats();
      expect(stats.last24hRaw).toBe(30);
      expect(stats.last24h).toBe('30s');
    });

    it('should format minutes correctly', async () => {
      await window.BetterUIStats.init();
      Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
      vi.advanceTimersByTime(120000); // 2 minutes

      const stats = window.BetterUIStats.getTimeStats();
      expect(stats.last24hRaw).toBe(120);
      expect(stats.last24h).toBe('2m');
    });

    it('should format hours correctly', async () => {
      await window.BetterUIStats.init();
      Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
      vi.advanceTimersByTime(3700000); // ~1h 1m

      const stats = window.BetterUIStats.getTimeStats();
      expect(stats.last24h).toBe('1h 1m');
    });
  });
});
