import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupChromeAPI } from './setup.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const backgroundCode = readFileSync(join(__dirname, '..', 'background.js'), 'utf-8');

describe('background.js - Service Worker', () => {
  let chrome;
  let messageHandler;

  beforeEach(() => {
    chrome = setupChromeAPI();
    // Evaluate the background script
    eval(backgroundCode);
    // Capture the registered message handler
    messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
  });

  it('should register a message listener on load', () => {
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledOnce();
    expect(typeof messageHandler).toBe('function');
  });

  describe('openTabs action', () => {
    it('should open tabs for each provided URL', () => {
      const sendResponse = vi.fn();
      const urls = ['https://x.com/user1', 'https://x.com/user2', 'https://x.com/user3'];

      messageHandler({ action: 'openTabs', urls }, {}, sendResponse);

      expect(chrome.tabs.create).toHaveBeenCalledTimes(3);
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://x.com/user1', active: false });
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://x.com/user2', active: false });
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://x.com/user3', active: false });
    });

    it('should respond with success and count', () => {
      const sendResponse = vi.fn();
      const urls = ['https://x.com/a', 'https://x.com/b'];

      messageHandler({ action: 'openTabs', urls }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({ success: true, opened: 2 });
    });

    it('should handle empty urls array', () => {
      const sendResponse = vi.fn();

      messageHandler({ action: 'openTabs', urls: [] }, {}, sendResponse);

      expect(chrome.tabs.create).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ success: true, opened: 0 });
    });

    it('should handle missing urls (defaults to empty array)', () => {
      const sendResponse = vi.fn();

      messageHandler({ action: 'openTabs' }, {}, sendResponse);

      expect(chrome.tabs.create).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ success: true, opened: 0 });
    });

    it('should open all tabs in background (active: false)', () => {
      const sendResponse = vi.fn();
      messageHandler({ action: 'openTabs', urls: ['https://x.com/test'] }, {}, sendResponse);

      expect(chrome.tabs.create).toHaveBeenCalledWith(
        expect.objectContaining({ active: false })
      );
    });
  });

  it('should return true to keep message channel open', () => {
    const sendResponse = vi.fn();
    const result = messageHandler({ action: 'openTabs', urls: [] }, {}, sendResponse);
    expect(result).toBe(true);
  });

  it('should not respond to unknown actions', () => {
    const sendResponse = vi.fn();
    messageHandler({ action: 'unknownAction' }, {}, sendResponse);
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
