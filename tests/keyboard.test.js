import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupChromeAPI, setupTwitterDOM, createMockTweet } from './setup.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const statsCode = readFileSync(join(__dirname, '..', 'stats.js'), 'utf-8');
const keyboardCode = readFileSync(join(__dirname, '..', 'keyboard.js'), 'utf-8');

function pressKey(key, opts = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
  document.body.dispatchEvent(event);
}

// Track all keydown handlers registered on window so we can clean them up
const registeredHandlers = [];
const origAddEventListener = window.addEventListener.bind(window);
const origRemoveEventListener = window.removeEventListener.bind(window);

function cleanupKeydownHandlers() {
  for (const handler of registeredHandlers) {
    origRemoveEventListener('keydown', handler, true);
    origRemoveEventListener('keydown', handler, false);
  }
  registeredHandlers.length = 0;
}

// Patch window.addEventListener to track keydown handlers
function patchAddEventListener() {
  window.addEventListener = function(type, handler, options) {
    if (type === 'keydown') {
      registeredHandlers.push(handler);
    }
    return origAddEventListener(type, handler, options);
  };
}

function restoreAddEventListener() {
  window.addEventListener = origAddEventListener;
}

describe('keyboard.js - BetterUIKeyboard Module', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupChromeAPI();
    document.body.innerHTML = '';
    document.body.className = '';
    Object.defineProperty(window, 'location', {
      value: { pathname: '/home', href: 'https://x.com/home' },
      writable: true,
      configurable: true,
    });
    setupTwitterDOM();
    cleanupKeydownHandlers();
    patchAddEventListener();
    eval(statsCode);
    eval(keyboardCode);
  });

  afterEach(() => {
    cleanupKeydownHandlers();
    restoreAddEventListener();
    vi.useRealTimers();
    delete window.BetterUIStats;
    delete window.BetterUIKeyboard;
  });

  it('should expose BetterUIKeyboard on window', () => {
    expect(window.BetterUIKeyboard).toBeDefined();
    expect(typeof window.BetterUIKeyboard.init).toBe('function');
  });

  it('should activate leader mode on Space press', () => {
    window.BetterUIKeyboard.init();
    pressKey(' ');
    vi.advanceTimersByTime(10);

    const leader = document.getElementById('betterui-leader');
    expect(leader).not.toBeNull();
    expect(leader.classList.contains('active')).toBe(true);
  });

  it('should deactivate leader after timeout', () => {
    window.BetterUIKeyboard.init();
    pressKey(' ');
    vi.advanceTimersByTime(10);

    const leader = document.getElementById('betterui-leader');
    expect(leader).not.toBeNull();
    expect(leader.classList.contains('active')).toBe(true);

    vi.advanceTimersByTime(1600);
    expect(leader.classList.contains('active')).toBe(false);
  });

  it('should deactivate leader on unmatched key', () => {
    window.BetterUIKeyboard.init();
    pressKey(' ');
    vi.advanceTimersByTime(10);
    pressKey('z');
    vi.advanceTimersByTime(10);

    const leader = document.getElementById('betterui-leader');
    expect(leader).not.toBeNull();
    expect(leader.classList.contains('active')).toBe(false);
  });

  it('should navigate tweets with j/k', () => {
    window.BetterUIKeyboard.init();
    const { cell: c1, article: a1 } = createMockTweet({ statusId: '1' });
    const { cell: c2, article: a2 } = createMockTweet({ statusId: '2' });
    const section = document.querySelector('[data-testid="primaryColumn"] section');
    section.appendChild(c1);
    section.appendChild(c2);

    a1.getBoundingClientRect = () => ({ top: 100, bottom: 300, height: 200, left: 0, right: 600, width: 600 });
    a2.getBoundingClientRect = () => ({ top: 300, bottom: 500, height: 200, left: 0, right: 600, width: 600 });

    pressKey('j');
    vi.advanceTimersByTime(10);

    const focused = document.querySelectorAll('.betterui-focused');
    expect(focused.length).toBe(1);
  });

  it('should scroll to top on g', () => {
    window.BetterUIKeyboard.init();
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    pressKey('g');
    vi.advanceTimersByTime(10);
    expect(scrollToSpy).toHaveBeenCalled();
    scrollToSpy.mockRestore();
  });

  it('should not intercept Cmd/Ctrl shortcuts', () => {
    window.BetterUIKeyboard.init();
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    pressKey('r', { metaKey: true });
    vi.advanceTimersByTime(10);
    expect(scrollToSpy).not.toHaveBeenCalled();
    scrollToSpy.mockRestore();
  });

  it('should detect input elements as typing targets and not navigate', () => {
    window.BetterUIKeyboard.init();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: input });
    document.body.dispatchEvent(event);
    vi.advanceTimersByTime(10);

    expect(document.querySelectorAll('.betterui-focused').length).toBe(0);
  });

  it('should detect textarea as typing', () => {
    window.BetterUIKeyboard.init();
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    const event = new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: textarea });
    document.body.dispatchEvent(event);
    vi.advanceTimersByTime(10);

    expect(document.querySelectorAll('.betterui-focused').length).toBe(0);
  });

  it('should detect contentEditable as typing', () => {
    window.BetterUIKeyboard.init();
    const div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);

    const event = new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: div });
    document.body.dispatchEvent(event);
    vi.advanceTimersByTime(10);

    expect(document.querySelectorAll('.betterui-focused').length).toBe(0);
  });

  it('should blur input on Escape while typing', () => {
    window.BetterUIKeyboard.init();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const blurSpy = vi.spyOn(input, 'blur');

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: input });
    document.body.dispatchEvent(event);
    vi.advanceTimersByTime(10);

    expect(blurSpy).toHaveBeenCalled();
  });

  it('should handle null target gracefully (defensive guard)', () => {
    window.BetterUIKeyboard.init();
    expect(() => {
      pressKey('j');
      vi.advanceTimersByTime(10);
    }).not.toThrow();
  });
});
