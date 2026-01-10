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

    // Parse notifications first to count them
    const validNotifications = [];
    notifications.forEach(cell => {
      const data = extractNotificationData(cell);
      if (data && !processedNotifications.has(data.id)) {
        validNotifications.push(data);
        processedNotifications.add(data.id);
      }
    });

    // Add header with count
    const header = document.createElement('div');
    header.className = 'betterui-notif-header';
    header.innerHTML = `
      <h2>Notifications</h2>
      <span class="notif-count">${validNotifications.length} items</span>
    `;
    list.appendChild(header);

    // Add notification rows
    validNotifications.forEach(data => {
      const row = createNotificationRow(data);
      list.appendChild(row);
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

      // Skip separator divs and non-notification items
      if (cell.querySelector('[role="separator"]')) return null;
      if (cell.offsetHeight < 30) return null;

      // Try multiple strategies to find username
      let username = '';
      let userHref = '';

      // Strategy 1: Look for user link with @ handle
      const allLinks = cell.querySelectorAll('a[href^="/"]');
      for (const link of allLinks) {
        const href = link.getAttribute('href') || '';
        // Skip status links, hashtags, search links
        if (href.includes('/status/') || href.includes('/search') ||
            href.includes('/hashtag') || href.includes('/i/')) continue;
        // Must be a simple username path like /username
        if (href.match(/^\/[a-zA-Z0-9_]+$/)) {
          username = link.textContent?.trim() || '';
          userHref = href;
          if (username && !username.includes(' ')) break;
        }
      }

      // Strategy 2: Look for spans with @ prefix
      if (!username) {
        const spans = cell.querySelectorAll('span');
        for (const span of spans) {
          const text = span.textContent?.trim() || '';
          if (text.startsWith('@') && text.length > 1 && !text.includes(' ')) {
            username = text;
            userHref = '/' + text.slice(1);
            break;
          }
        }
      }

      // Strategy 3: Extract from notification text patterns
      if (!username) {
        const match = textContent.match(/@([a-zA-Z0-9_]+)/);
        if (match) {
          username = '@' + match[1];
          userHref = '/' + match[1];
        }
      }

      // Fallback if no username found
      if (!username) {
        // Look for any text before action keywords
        const actionMatch = textContent.match(/^(.+?)\s+(liked|retweeted|followed|replied|quoted|mentioned)/i);
        if (actionMatch) {
          username = actionMatch[1].trim().split('\n')[0].slice(0, 30);
        } else {
          username = 'Someone';
        }
      }

      // Get avatar - try multiple image sources
      let avatar = '';
      const imgs = cell.querySelectorAll('img');
      for (const img of imgs) {
        const src = img.src || '';
        if (src.includes('profile_images') || src.includes('pbs.twimg.com/profile')) {
          avatar = src;
          break;
        }
      }
      // Also try background images in divs
      if (!avatar) {
        const avatarDiv = cell.querySelector('[style*="profile_images"]');
        if (avatarDiv) {
          const style = avatarDiv.getAttribute('style') || '';
          const urlMatch = style.match(/url\(['"]?([^'"]+)['"]?\)/);
          if (urlMatch) avatar = urlMatch[1];
        }
      }

      // Determine action type from text
      let action = 'interacted';
      const lowerText = textContent.toLowerCase();
      if (lowerText.includes('liked your')) action = 'liked';
      else if (lowerText.includes('liked a post')) action = 'liked';
      else if (lowerText.includes('retweeted')) action = 'retweeted';
      else if (lowerText.includes('replied')) action = 'replied';
      else if (lowerText.includes('followed you') || lowerText.includes('is now following')) action = 'followed';
      else if (lowerText.includes('mentioned')) action = 'mentioned';
      else if (lowerText.includes('quoted')) action = 'quoted';
      else if (lowerText.includes('posted')) action = 'posted';
      else if (lowerText.includes('liked')) action = 'liked';

      // Get link to content
      const contentLink = cell.querySelector('a[href*="/status/"]');
      const contentHref = contentLink?.getAttribute('href') || '';

      // Get content preview text
      let contentPreview = '';
      const tweetText = cell.querySelector('[data-testid="tweetText"]');
      if (tweetText) {
        contentPreview = tweetText.textContent?.trim() || '';
      } else if (contentLink) {
        // Try to get text near the status link
        const linkText = contentLink.textContent?.trim() || '';
        if (linkText && !linkText.match(/^\d+:\d+/)) { // Not just a timestamp
          contentPreview = linkText;
        }
      }

      // Get time - try multiple formats
      let time = '';
      const timeEl = cell.querySelector('time');
      if (timeEl) {
        time = timeEl.textContent?.trim() || '';
        if (!time) {
          const datetime = timeEl.getAttribute('datetime');
          if (datetime) {
            const date = new Date(datetime);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 60) time = `${diffMins}m`;
            else if (diffHours < 24) time = `${diffHours}h`;
            else if (diffDays < 7) time = `${diffDays}d`;
            else time = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          }
        }
      }

      // Generate unique ID
      const id = `${username}-${action}-${contentHref || textContent.slice(0, 50)}-${time}`;

      return {
        id,
        username: username.slice(0, 50),
        userHref,
        avatar,
        action,
        contentHref,
        contentPreview: contentPreview.slice(0, 150),
        time
      };
    } catch (e) {
      console.error('Notification extraction error:', e);
      return null;
    }
  }
  
  function createNotificationRow(data) {
    const row = document.createElement('div');
    row.className = `betterui-notif-row type-${data.action}`;
    row.dataset.id = data.id;

    // Very short action labels
    const actionLabels = {
      'liked': 'LIKE',
      'retweeted': 'RT',
      'replied': 'REPLY',
      'followed': 'FOLLOW',
      'mentioned': '@',
      'quoted': 'QUOTE',
      'posted': 'POST',
      'interacted': 'NEW'
    };

    // Avatar HTML - use default icon if no avatar
    const avatarHtml = data.avatar
      ? `<img class="notif-avatar" src="${data.avatar}" alt="" onerror="this.outerHTML='<div class=\\'notif-avatar x-default\\'>X</div>'">`
      : `<div class="notif-avatar x-default">X</div>`;

    // Build the username display
    const displayName = data.username;

    // Content - only create link if we have a real href
    let contentHtml;
    if (data.contentHref && data.contentPreview) {
      contentHtml = `<a href="https://x.com${data.contentHref}" class="notif-content">${escapeHtml(data.contentPreview)}</a>`;
    } else if (data.contentPreview) {
      contentHtml = `<span class="notif-content">${escapeHtml(data.contentPreview)}</span>`;
    } else {
      contentHtml = `<span class="notif-content empty"></span>`;
    }

    // Format time to be always short
    const shortTime = formatShortTime(data.time);

    // Username - only create link if we have a real href
    const usernameHtml = data.userHref
      ? `<a href="https://x.com${data.userHref}" class="notif-username">${escapeHtml(displayName)}</a>`
      : `<span class="notif-username">${escapeHtml(displayName)}</span>`;

    // Flat grid structure: avatar | username | action | content | time
    row.innerHTML = `
      ${avatarHtml}
      ${usernameHtml}
      <span class="action-text">${actionLabels[data.action] || 'NEW'}</span>
      ${contentHtml}
      <span class="notif-time">${shortTime}</span>
    `;

    // Make the whole row clickable if there's content
    if (data.contentHref) {
      row.addEventListener('click', (e) => {
        if (e.target.tagName !== 'A') {
          window.location.href = `https://x.com${data.contentHref}`;
        }
      });
    }

    return row;
  }

  // Format time to always be short (1m, 2h, 3d, Jan 8)
  function formatShortTime(timeStr) {
    if (!timeStr) return '';

    // Already short format
    if (/^\d+[mhd]$/.test(timeStr)) return timeStr;

    // Try to parse full dates like "Dec 28, 2025"
    const dateMatch = timeStr.match(/([A-Z][a-z]{2})\s+(\d{1,2}),?\s*(\d{4})?/i);
    if (dateMatch) {
      const [, month, day, year] = dateMatch;
      const currentYear = new Date().getFullYear();
      // If same year or no year, just show "Jan 8"
      if (!year || parseInt(year) === currentYear) {
        return `${month} ${day}`;
      }
      return `${month} ${day}`;
    }

    // Return as-is if can't parse
    return timeStr.length > 8 ? timeStr.slice(0, 6) : timeStr;
  }

  // Helper to escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

    let addedCount = 0;
    const cells = document.querySelectorAll('[data-testid="cellInnerDiv"]');
    cells.forEach(cell => {
      const data = extractNotificationData(cell);
      if (data && !processedNotifications.has(data.id)) {
        processedNotifications.add(data.id);
        const row = createNotificationRow(data);
        // Insert after header
        const header = list.querySelector('.betterui-notif-header');
        if (header && header.nextSibling) {
          list.insertBefore(row, header.nextSibling);
        } else {
          list.appendChild(row);
        }
        addedCount++;
      }
    });

    // Update count in header
    if (addedCount > 0) {
      const countEl = list.querySelector('.notif-count');
      if (countEl) {
        const total = list.querySelectorAll('.betterui-notif-row').length;
        countEl.textContent = `${total} items`;
      }
    }
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
