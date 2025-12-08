// BetterUI Content Script - Main entry point

(function() {
  'use strict';
  
  let bookmarksGridBuilt = false;
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
        console.log('[BetterUI] Hiding ad:', tweet.querySelector('[data-testid="User-Name"]')?.textContent?.slice(0, 50));
      } else {
        cell.dataset.betteruiAd = 'false';
        // Ensure cell is visible
        cell.style.removeProperty('display');
      }
    });
  }
  
  function setupAdRemoval() {
    // Initial removal with slight delay to let content render
    setTimeout(removeAds, 100);
    setTimeout(removeAds, 500);
    setTimeout(removeAds, 1000);
    
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
      }
    });
    
    // Observe the timeline for new content
    const timeline = document.querySelector('[data-testid="primaryColumn"]');
    if (timeline) {
      observer.observe(timeline, { childList: true, subtree: true });
    } else {
      // Retry if timeline not found yet
      setTimeout(setupAdRemoval, 500);
    }
    
    console.log('[BetterUI] Ad removal active');
  }
  
  // ==========================================
  // Page Type Detection
  // ==========================================
  
  function updatePageClasses() {
    const path = window.location.pathname;
    
    // Remove all page-specific classes
    document.body.classList.remove(
      'betterui-bookmarks-page', 
      'betterui-tweet-page',
      'betterui-media-page',
      'betterui-grid-active'
    );
    
    // Reset bookmarks grid when leaving
    if (path !== '/i/bookmarks') {
      bookmarksGridBuilt = false;
      const grid = document.getElementById('betterui-bookmarks-grid');
      if (grid) grid.remove();
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
  }
  
  // ==========================================
  // Bookmarks Grid
  // ==========================================
  
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
      if (data) bookmarks.push(data);
    });
    
    if (bookmarks.length === 0) return;
    
    // Create grid container
    const grid = document.createElement('div');
    grid.id = 'betterui-bookmarks-grid';
    
    bookmarks.forEach((bookmark, index) => {
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
      
      grid.appendChild(card);
    });
    
    // Insert grid into page
    const primaryColumn = document.querySelector('[data-testid="primaryColumn"]');
    if (primaryColumn) {
      primaryColumn.appendChild(grid);
      document.body.classList.add('betterui-grid-active');
      bookmarksGridBuilt = true;
      console.log(`[BetterUI] Built bookmarks grid with ${bookmarks.length} items`);
    }
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
    console.log('[BetterUI] Initializing...');
    
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
    
    console.log('[BetterUI] Ready. Press Space + ? for keyboard shortcuts.');
  }
  
  init();
})();
