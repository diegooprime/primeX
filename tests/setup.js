// Test setup: mock Chrome extension APIs
import { vi } from 'vitest';

// Mock IntersectionObserver for jsdom
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class IntersectionObserver {
    constructor(callback) {
      this._callback = callback;
      this._entries = [];
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Mock MutationObserver enhancements (jsdom has it but ensure it works)
if (typeof globalThis.MutationObserver === 'undefined') {
  globalThis.MutationObserver = class MutationObserver {
    constructor(callback) {
      this._callback = callback;
    }
    observe() {}
    disconnect() {}
    takeRecords() { return []; }
  };
}

export function setupChromeAPI() {
  const storageData = {};

  const chrome = {
    runtime: {
      onMessage: {
        addListener: vi.fn(),
      },
      sendMessage: vi.fn(),
    },
    tabs: {
      create: vi.fn((opts) => Promise.resolve({ id: Math.random(), ...opts })),
    },
    storage: {
      local: {
        get: vi.fn((key) => {
          if (typeof key === 'string') {
            return Promise.resolve({ [key]: storageData[key] || undefined });
          }
          return Promise.resolve({});
        }),
        set: vi.fn((data) => {
          Object.assign(storageData, data);
          return Promise.resolve();
        }),
      },
    },
  };

  globalThis.chrome = chrome;
  return chrome;
}

export function setupTwitterDOM() {
  document.body.innerHTML = '';
  document.body.className = '';

  // Set up a basic Twitter-like DOM structure
  const primaryColumn = document.createElement('div');
  primaryColumn.setAttribute('data-testid', 'primaryColumn');
  const section = document.createElement('section');
  primaryColumn.appendChild(section);
  document.body.appendChild(primaryColumn);

  return { primaryColumn, section };
}

export function createMockTweet({ username = 'testuser', text = 'Hello world', statusId = '123456', hasMedia = false, isAd = false } = {}) {
  const cell = document.createElement('div');
  cell.setAttribute('data-testid', 'cellInnerDiv');

  const article = document.createElement('article');
  article.setAttribute('data-testid', 'tweet');

  // User name
  const userNameDiv = document.createElement('div');
  userNameDiv.setAttribute('data-testid', 'User-Name');
  const userLink = document.createElement('a');
  userLink.href = `/${username}`;
  userLink.textContent = username;
  userNameDiv.appendChild(userLink);

  if (isAd) {
    const adSpan = document.createElement('span');
    adSpan.textContent = 'Ad';
    userNameDiv.appendChild(adSpan);
  }

  article.appendChild(userNameDiv);

  // Avatar
  const avatarDiv = document.createElement('div');
  avatarDiv.setAttribute('data-testid', 'Tweet-User-Avatar');
  const avatarImg = document.createElement('img');
  avatarImg.src = `https://pbs.twimg.com/profile_images/${username}/photo.jpg`;
  avatarDiv.appendChild(avatarImg);
  article.appendChild(avatarDiv);

  // Tweet text
  const tweetTextDiv = document.createElement('div');
  tweetTextDiv.setAttribute('data-testid', 'tweetText');
  tweetTextDiv.textContent = text;
  article.appendChild(tweetTextDiv);

  // Time/status link
  const timeLink = document.createElement('a');
  timeLink.href = `https://x.com/${username}/status/${statusId}`;
  const timeEl = document.createElement('time');
  timeEl.textContent = '2h';
  timeEl.setAttribute('datetime', new Date().toISOString());
  timeLink.appendChild(timeEl);
  article.appendChild(timeLink);

  // Media
  if (hasMedia) {
    const photo = document.createElement('div');
    photo.setAttribute('data-testid', 'tweetPhoto');
    article.appendChild(photo);
  }

  // Engagement buttons
  const engagementButtons = ['like', 'retweet', 'bookmark', 'reply'];
  engagementButtons.forEach(action => {
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', action);
    article.appendChild(btn);
  });

  cell.appendChild(article);
  return { cell, article };
}

export function createMockNotification({ username = 'notifuser', action = 'liked', text = 'Great tweet', time = '2h' } = {}) {
  const cell = document.createElement('div');
  cell.setAttribute('data-testid', 'cellInnerDiv');
  cell.style.height = '80px';

  const userLink = document.createElement('a');
  userLink.href = `/${username}`;
  userLink.textContent = username;
  cell.appendChild(userLink);

  const actionSpan = document.createElement('span');
  actionSpan.textContent = `${username} ${action} your post`;
  cell.appendChild(actionSpan);

  const tweetText = document.createElement('div');
  tweetText.setAttribute('data-testid', 'tweetText');
  tweetText.textContent = text;
  cell.appendChild(tweetText);

  const contentLink = document.createElement('a');
  contentLink.href = `/${username}/status/789`;
  contentLink.textContent = 'View';
  cell.appendChild(contentLink);

  const timeEl = document.createElement('time');
  timeEl.textContent = time;
  timeEl.setAttribute('datetime', new Date().toISOString());
  cell.appendChild(timeEl);

  const avatarImg = document.createElement('img');
  avatarImg.src = `https://pbs.twimg.com/profile_images/${username}/photo.jpg`;
  cell.appendChild(avatarImg);

  return cell;
}
