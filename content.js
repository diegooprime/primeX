// BetterUI Content Script - Main entry point

(function() {
  'use strict';
  
  let bookmarksGridBuilt = false;
  let notificationsListBuilt = false;
  let profileTabsBuilt = false;
  let lastPath = '';
  
  // ==========================================
  // Stats Widget
  // ==========================================
  
  function createStatsWidget() {
    const widget = document.createElement('div');
    widget.id = 'betterui-stats';
    widget.innerHTML = `
      <div class="stat-row">
        <span class="stat-label">24h</span>
        <span class="stat-value" id="betterui-time-24h">0m</span>
        <span class="stat-tweets" id="betterui-tweets-24h">0 tweets</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">7d</span>
        <span class="stat-value" id="betterui-time-7d">0m</span>
        <span class="stat-tweets" id="betterui-tweets-7d">0 tweets</span>
      </div>
    `;
    document.body.appendChild(widget);
    return widget;
  }
  
  function updateStatsWidget() {
    if (!window.BetterUIStats) return;
    
    const timeStats = window.BetterUIStats.getTimeStats();
    const tweetCounts = window.BetterUIStats.getScrolledTweetsCount();
    
    const time24h = document.getElementById('betterui-time-24h');
    const time7d = document.getElementById('betterui-time-7d');
    const tweets24h = document.getElementById('betterui-tweets-24h');
    const tweets7d = document.getElementById('betterui-tweets-7d');
    
    if (time24h) {
      time24h.textContent = timeStats.last24h;
      time24h.className = 'stat-value';
      if (timeStats.last24hRaw > 7200) {
        time24h.classList.add('bad');
      } else if (timeStats.last24hRaw > 3600) {
        time24h.classList.add('warning');
      }
    }
    
    if (time7d) {
      time7d.textContent = timeStats.last7d;
    }
    
    if (tweets24h) {
      tweets24h.textContent = `${tweetCounts.last24h} tweets`;
    }
    
    if (tweets7d) {
      tweets7d.textContent = `${tweetCounts.last7d} tweets`;
    }
  }
  
  // ==========================================
  // Ad Removal
  // ==========================================
  
  function removeAds() {
    // Find all tweet cells
    const cells = document.querySelectorAll('[data-testid="cellInnerDiv"]');
    
    cells.forEach(cell => {
      // Keep hiding if already marked as ad
      if (cell.dataset.betteruiAd === 'true') {
        cell.style.display = 'none';
        return;
      }
      // Re-check cells periodically - the "Ad" label might load late
      // Only skip if we've checked it multiple times already
      const checkCount = parseInt(cell.dataset.betteruiCheckCount || '0', 10);
      const MAX_CHECKS = 8; // give the ad label time to render
      if (cell.dataset.betteruiAd === 'false' && checkCount >= MAX_CHECKS) {
        return; // Already checked multiple times, definitely not an ad
      }
      cell.dataset.betteruiCheckCount = String(checkCount + 1);
      
      let isAd = false;
      
      // Get the tweet article
      const tweet = cell.querySelector('article[data-testid="tweet"]');
      if (!tweet) {
        // No tweet article = not a regular tweet, skip
        return;
      }
      
      // Method 1: Check username/header area for "Ad" / "Promoted"
      const header = tweet.querySelector('[data-testid="User-Name"]');
      if (header) {
        const headerSpans = header.querySelectorAll('span');
        for (const span of headerSpans) {
          const text = span.textContent.trim().toLowerCase();
          if (text === 'ad' || text === 'promoted') {
            isAd = true;
            break;
          }
        }
      }
      
      // Method 2: Social context often contains "Promoted by ..."
      if (!isAd) {
        const socialContext = tweet.querySelector('[data-testid="socialContext"]');
        const contextText = socialContext?.textContent?.toLowerCase() || '';
        if (contextText.includes('promoted') || contextText === 'ad' || contextText.startsWith('ad ·')) {
          isAd = true;
        }
      }
      
      // Method 3: Fallback scan for isolated "Ad"/"Promoted" spans not in tweet body
      if (!isAd) {
        const allSpans = tweet.querySelectorAll('span');
        for (const span of allSpans) {
          const text = span.textContent.trim().toLowerCase();
          if (text === 'ad' || text === 'promoted') {
            const isInTweetText = span.closest('[data-testid="tweetText"]');
            if (!isInTweetText) {
              isAd = true;
              break;
            }
          }
        }
      }
      
      // Method 4: Check for promotedIndicator testid
      if (!isAd && tweet.querySelector('[data-testid="promotedIndicator"]')) {
        isAd = true;
      }
      
      // Mark the cell
      if (isAd) {
        cell.style.display = 'none';
        cell.dataset.betteruiAd = 'true';
      } else {
        cell.dataset.betteruiAd = 'false';
        // Ensure cell is visible
        cell.style.removeProperty('display');
      }
    });
  }
  
  // ==========================================
  // Hide Floating Elements (Messages, etc.)
  // ==========================================
  
  function hideFloatingElements() {
    // Hide chat drawer / floating messages button
    const selectors = [
      '[data-testid="chat-drawer-root"]',
      '[data-testid="chat-drawer-main"]',
      '[data-testid="DM_Fab"]',
      '[data-testid="DMFab"]',
      'a[href="/messages"]'
    ];
    
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        // Don't hide if it's inside the main nav or layers
        if (!el.closest('#layers') && !el.closest('[data-testid="primaryColumn"]')) {
          el.style.display = 'none';
          el.style.visibility = 'hidden';
          // Also try to hide parent containers
          let parent = el.parentElement;
          let depth = 0;
          while (parent && depth < 5) {
            // If parent has fixed/absolute positioning at bottom, hide it
            const style = window.getComputedStyle(parent);
            if ((style.position === 'fixed' || style.position === 'absolute') && 
                (style.bottom === '0px' || parseInt(style.bottom) < 100)) {
              parent.style.display = 'none';
              break;
            }
            parent = parent.parentElement;
            depth++;
          }
        }
      });
    });
    
    // Also hide by aria-label
    document.querySelectorAll('[aria-label="Messages"], [aria-label="Direct message"]').forEach(el => {
      if (!el.closest('article') && !el.closest('[data-testid="primaryColumn"]')) {
        el.style.display = 'none';
      }
    });
  }
  
  function setupAdRemoval() {
    // Initial removal with slight delay to let content render
    setTimeout(removeAds, 100);
    setTimeout(removeAds, 500);
    setTimeout(removeAds, 1000);
    
    // Also hide floating elements
    setTimeout(hideFloatingElements, 100);
    setTimeout(hideFloatingElements, 500);
    setTimeout(hideFloatingElements, 1000);
    setTimeout(hideFloatingElements, 2000);
    
    // Watch for new ads being loaded
    const observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldCheck = true;
          break;
        }
      }
      if (shouldCheck) {
        // Small delay to let content fully render
        setTimeout(removeAds, 50);
        // Re-check after a bit in case "Ad" label loads late
        setTimeout(removeAds, 300);
        // Also check for floating elements
        setTimeout(hideFloatingElements, 100);
      }
    });
    
    // Observe the entire body for floating elements
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Observe the timeline for new content
    const timeline = document.querySelector('[data-testid="primaryColumn"]');
    if (timeline) {
      observer.observe(timeline, { childList: true, subtree: true });
    } else {
      // Retry if timeline not found yet
      setTimeout(setupAdRemoval, 500);
    }
  }
  
  // ==========================================
  // Page Type Detection
  // ==========================================
  
  function isOnProfilePage() {
    const path = window.location.pathname;
    // Profile pages: /username, /username/with_replies, /username/media, /username/likes
    // But NOT /i/*, /home, /search, /compose, etc.
    return /^\/[a-zA-Z0-9_]+($|\/with_replies|\/media|\/likes|\/highlights)/.test(path) &&
           !path.startsWith('/i/') &&
           !path.startsWith('/home') &&
           !path.startsWith('/search') &&
           !path.startsWith('/compose') &&
           !path.startsWith('/settings') &&
           !path.startsWith('/messages') &&
           !/\/status\//.test(path);
  }
  
  function updatePageClasses() {
    const path = window.location.pathname;
    
    // Remove all page-specific classes
    document.body.classList.remove(
      'betterui-bookmarks-page', 
      'betterui-tweet-page',
      'betterui-media-page',
      'betterui-grid-active',
      'betterui-notifications-page',
      'betterui-profile-page'
    );
    
    // Reset bookmarks grid when leaving
    if (path !== '/i/bookmarks') {
      bookmarksGridBuilt = false;
      processedTweetUrls.clear();
      if (bookmarksObserver) {
        bookmarksObserver.disconnect();
        bookmarksObserver = null;
      }
      const grid = document.getElementById('betterui-bookmarks-grid');
      if (grid) grid.remove();
    }
    
    // Reset notifications list when leaving
    if (!path.startsWith('/notifications')) {
      notificationsListBuilt = false;
      const notifList = document.getElementById('betterui-notifications-list');
      if (notifList) notifList.remove();
    }
    
    // Reset profile tabs when leaving profile pages
    if (!isOnProfilePage()) {
      profileTabsBuilt = false;
      const tabs = document.getElementById('betterui-profile-tabs');
      if (tabs) tabs.remove();
    }
    
    // Add class based on current page
    if (path === '/i/bookmarks') {
      document.body.classList.add('betterui-bookmarks-page');
      setTimeout(buildBookmarksGrid, 500);
    } else if (/^\/[a-zA-Z0-9_]+\/status\/\d+/.test(path)) {
      // Tweet detail page (including photo/video views)
      document.body.classList.add('betterui-tweet-page');
    } else if (/^\/[a-zA-Z0-9_]+\/(media|likes|photo|video)/.test(path)) {
      // Profile sub-pages (media tab, likes, etc.) or media lightbox
      document.body.classList.add('betterui-media-page');
    }
    
    // Profile page detection
    if (isOnProfilePage()) {
      document.body.classList.add('betterui-profile-page');
      setTimeout(buildProfileTabs, 500);
    }
    
    // Notifications page
    if (path.startsWith('/notifications') || path === '/i/notifications') {
      document.body.classList.add('betterui-notifications-page');
      setTimeout(buildNotificationsList, 500);
    }
  }
  
  // ==========================================
  // Bookmarks Grid
  // ==========================================
  
  let bookmarksObserver = null;
  let processedTweetUrls = new Set();
  
  function buildBookmarksGrid() {
    if (bookmarksGridBuilt) return;
    
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    if (tweets.length === 0) {
      // Try again later
      setTimeout(buildBookmarksGrid, 500);
      return;
    }
    
    // Extract data from tweets
    const bookmarks = [];
    tweets.forEach(tweet => {
      const data = extractTweetData(tweet);
      if (data && !processedTweetUrls.has(data.url)) {
        bookmarks.push(data);
        processedTweetUrls.add(data.url);
      }
    });
    
    if (bookmarks.length === 0) return;
    
    // Create grid container
    const grid = document.createElement('div');
    grid.id = 'betterui-bookmarks-grid';
    
    bookmarks.forEach((bookmark, index) => {
      const card = createBookmarkCard(bookmark, index);
      grid.appendChild(card);
    });
    
    // Insert grid into page
    const primaryColumn = document.querySelector('[data-testid="primaryColumn"]');
    if (primaryColumn) {
      primaryColumn.appendChild(grid);
      document.body.classList.add('betterui-grid-active');
      bookmarksGridBuilt = true;
      
      // Setup observer for dynamically loaded bookmarks
      setupBookmarksObserver();
    }
  }
  
  function createBookmarkCard(bookmark, index) {
    const card = document.createElement('div');
    card.className = 'betterui-bookmark-card';
    card.dataset.url = bookmark.url;
    card.dataset.index = index;
    
    card.innerHTML = `
      <div class="bookmark-header">
        <img class="bookmark-avatar" src="${bookmark.avatar}" alt="">
        <span class="bookmark-user">${bookmark.username}</span>
        <span class="bookmark-time">${bookmark.time}</span>
      </div>
      <div class="bookmark-text">${bookmark.text}</div>
      ${bookmark.hasMedia ? '<div class="bookmark-media">📷 has media</div>' : ''}
    `;
    
    card.addEventListener('click', () => {
      window.location.href = bookmark.url;
    });
    
    return card;
  }
  
  function setupBookmarksObserver() {
    if (bookmarksObserver) return;
    
    const timeline = document.querySelector('[data-testid="primaryColumn"] section');
    if (!timeline) return;
    
    bookmarksObserver = new MutationObserver((mutations) => {
      let hasNewTweets = false;
      
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1 && (node.querySelector?.('article[data-testid="tweet"]') || node.matches?.('article[data-testid="tweet"]'))) {
              hasNewTweets = true;
              break;
            }
          }
        }
        if (hasNewTweets) break;
      }
      
      if (hasNewTweets) {
        // Debounce the update
        setTimeout(appendNewBookmarks, 100);
      }
    });
    
    bookmarksObserver.observe(timeline, { childList: true, subtree: true });
  }
  
  function appendNewBookmarks() {
    const grid = document.getElementById('betterui-bookmarks-grid');
    if (!grid) return;
    
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    let addedCount = 0;
    
    tweets.forEach(tweet => {
      const data = extractTweetData(tweet);
      if (data && !processedTweetUrls.has(data.url)) {
        processedTweetUrls.add(data.url);
        const card = createBookmarkCard(data, processedTweetUrls.size - 1);
        grid.appendChild(card);
        addedCount++;
      }
    });
  }
  
  function extractTweetData(tweet) {
    try {
      // Get tweet URL
      const timeLink = tweet.querySelector('a[href*="/status/"] time');
      const url = timeLink?.closest('a')?.href || '';
      
      // Get username
      const userNameEl = tweet.querySelector('[data-testid="User-Name"]');
      const username = userNameEl?.querySelector('a')?.textContent || 'Unknown';
      
      // Get avatar
      const avatarImg = tweet.querySelector('[data-testid="Tweet-User-Avatar"] img');
      const avatar = avatarImg?.src || '';
      
      // Get time
      const time = timeLink?.textContent || '';
      
      // Get tweet text
      const textEl = tweet.querySelector('[data-testid="tweetText"]');
      const text = textEl?.textContent || '';
      
      // Check for media
      const hasMedia = !!(tweet.querySelector('[data-testid="tweetPhoto"]') || 
                         tweet.querySelector('[data-testid="videoPlayer"]'));
      
      return { url, username, avatar, time, text, hasMedia };
    } catch (e) {
      return null;
    }
  }
  
  // ==========================================
  // Profile Tabs (Replies, Media, Likes)
  // ==========================================
  
  function buildProfileTabs() {
    if (profileTabsBuilt) return;
    
    // Extract username from path
    const path = window.location.pathname;
    const match = path.match(/^\/([a-zA-Z0-9_]+)/);
    if (!match) return;
    
    const username = match[1];
    const currentTab = path.includes('/with_replies') ? 'replies' :
                       path.includes('/media') ? 'media' :
                       path.includes('/likes') ? 'likes' :
                       path.includes('/highlights') ? 'highlights' : 'posts';
    
    // Create tabs container
    const tabs = document.createElement('div');
    tabs.id = 'betterui-profile-tabs';
    
    const tabsData = [
      { id: 'posts', label: 'Posts', key: '1', path: `/${username}` },
      { id: 'replies', label: 'Replies', key: '2', path: `/${username}/with_replies` },
      { id: 'media', label: 'Media', key: '3', path: `/${username}/media` },
      { id: 'likes', label: 'Likes', key: '4', path: `/${username}/likes` }
    ];
    
    tabsData.forEach(tab => {
      const btn = document.createElement('button');
      btn.className = 'betterui-profile-tab' + (currentTab === tab.id ? ' active' : '');
      btn.innerHTML = `<span class="tab-key">${tab.key}</span> ${tab.label}`;
      btn.dataset.tab = tab.id;
      btn.addEventListener('click', () => {
        window.location.href = `https://x.com${tab.path}`;
      });
      tabs.appendChild(btn);
    });
    
    document.body.appendChild(tabs);
    profileTabsBuilt = true;
  }
  
  // ==========================================
  // Notifications List View
  // ==========================================
  
  let notificationsObserver = null;
  let processedNotifications = new Set();
  
  function buildNotificationsList() {
    if (notificationsListBuilt) return;
    
    // Wait for notifications to load
    const notifications = document.querySelectorAll('[data-testid="cellInnerDiv"]');
    if (notifications.length === 0) {
      setTimeout(buildNotificationsList, 500);
      return;
    }
    
    // Create list container
    const list = document.createElement('div');
    list.id = 'betterui-notifications-list';
    
    // Add header
    const header = document.createElement('div');
    header.className = 'betterui-notif-header';
    header.innerHTML = `
      <span class="col-account">Account</span>
      <span class="col-action">Action</span>
      <span class="col-link">Content</span>
      <span class="col-date">Date</span>
    `;
    list.appendChild(header);
    
    // Parse notifications
    notifications.forEach(cell => {
      const data = extractNotificationData(cell);
      if (data && !processedNotifications.has(data.id)) {
        const row = createNotificationRow(data);
        list.appendChild(row);
        processedNotifications.add(data.id);
      }
    });
    
    // Insert list into page
    const primaryColumn = document.querySelector('[data-testid="primaryColumn"]');
    if (primaryColumn) {
      primaryColumn.appendChild(list);
      document.body.classList.add('betterui-notifications-active');
      notificationsListBuilt = true;
      
      // Setup observer for new notifications
      setupNotificationsObserver();
    }
  }
  
  function extractNotificationData(cell) {
    try {
      // Get notification article or container
      const article = cell.querySelector('article') || cell;
      
      // Get the main text content
      const textContent = article.textContent || '';
      if (!textContent.trim()) return null;
      
      // Try to find account info
      const userLink = cell.querySelector('a[href^="/"][role="link"]');
      const username = userLink?.textContent || 'Unknown';
      const userHref = userLink?.getAttribute('href') || '';
      
      // Get avatar
      const avatar = cell.querySelector('img[src*="profile"]')?.src || 
                     cell.querySelector('img[src*="pbs.twimg"]')?.src || '';
      
      // Determine action type from text
      let action = 'interacted';
      const lowerText = textContent.toLowerCase();
      if (lowerText.includes('liked')) action = 'liked';
      else if (lowerText.includes('retweeted')) action = 'retweeted';
      else if (lowerText.includes('replied')) action = 'replied';
      else if (lowerText.includes('followed')) action = 'followed';
      else if (lowerText.includes('mentioned')) action = 'mentioned';
      else if (lowerText.includes('quoted')) action = 'quoted';
      else if (lowerText.includes('posted')) action = 'posted';
      
      // Get link to content
      const contentLink = cell.querySelector('a[href*="/status/"]');
      const contentHref = contentLink?.getAttribute('href') || '';
      const contentPreview = cell.querySelector('[data-testid="tweetText"]')?.textContent || 
                             contentLink?.textContent || '';
      
      // Get time if available
      const time = cell.querySelector('time')?.textContent || 
                   cell.querySelector('time')?.getAttribute('datetime') || '';
      
      // Generate unique ID
      const id = `${username}-${action}-${contentHref || Date.now()}`;
      
      return {
        id,
        username,
        userHref,
        avatar,
        action,
        contentHref,
        contentPreview: contentPreview.slice(0, 100),
        time
      };
    } catch (e) {
      return null;
    }
  }
  
  function createNotificationRow(data) {
    const row = document.createElement('div');
    row.className = 'betterui-notif-row';
    row.dataset.id = data.id;
    
    // Action icons
    const actionIcons = {
      'liked': '❤️',
      'retweeted': '🔄',
      'replied': '💬',
      'followed': '👤',
      'mentioned': '@',
      'quoted': '💬',
      'posted': '📝',
      'interacted': '🔔'
    };
    
    row.innerHTML = `
      <div class="col-account">
        ${data.avatar ? `<img class="notif-avatar" src="${data.avatar}" alt="">` : ''}
        <a href="https://x.com${data.userHref}" class="notif-username">${data.username}</a>
      </div>
      <div class="col-action">
        <span class="action-icon">${actionIcons[data.action] || '🔔'}</span>
        <span class="action-text">${data.action}</span>
      </div>
      <div class="col-link">
        ${data.contentHref ? 
          `<a href="https://x.com${data.contentHref}" class="notif-content">${data.contentPreview || 'View post'}</a>` : 
          `<span class="notif-content-empty">—</span>`
        }
      </div>
      <div class="col-date">${data.time}</div>
    `;
    
    return row;
  }
  
  function setupNotificationsObserver() {
    if (notificationsObserver) return;
    
    const timeline = document.querySelector('[data-testid="primaryColumn"] section');
    if (!timeline) return;
    
    notificationsObserver = new MutationObserver((mutations) => {
      let hasNew = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          hasNew = true;
          break;
        }
      }
      if (hasNew) {
        setTimeout(appendNewNotifications, 100);
      }
    });
    
    notificationsObserver.observe(timeline, { childList: true, subtree: true });
  }
  
  function appendNewNotifications() {
    const list = document.getElementById('betterui-notifications-list');
    if (!list) return;
    
    const cells = document.querySelectorAll('[data-testid="cellInnerDiv"]');
    cells.forEach(cell => {
      const data = extractNotificationData(cell);
      if (data && !processedNotifications.has(data.id)) {
        processedNotifications.add(data.id);
        const row = createNotificationRow(data);
        list.appendChild(row);
      }
    });
  }
  
  function setupPageDetection() {
    updatePageClasses();
    lastPath = window.location.pathname;
    
    // Watch for navigation changes
    const observer = new MutationObserver(() => {
      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname;
        updatePageClasses();
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', updatePageClasses);
  }
  
  // ==========================================
  // Initialization
  // ==========================================
  
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onReady);
    } else {
      onReady();
    }
  }
  
  function onReady() {
    if (window.BetterUIStats) {
      window.BetterUIStats.init();
    }
    
    if (window.BetterUIKeyboard) {
      window.BetterUIKeyboard.init();
    }
    
    setupPageDetection();
    setupAdRemoval();
    createStatsWidget();
    updateStatsWidget();
    setInterval(updateStatsWidget, 5000);
  }
  
  init();
})();
