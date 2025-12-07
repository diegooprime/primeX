// BetterUI Stats Module - Time tracking and engagement ratio

const BetterUIStats = (function() {
  const STORAGE_KEY = 'betterui_stats';
  const TICK_INTERVAL = 1000; // Update every second
  const SAVE_INTERVAL = 10000; // Save to storage every 10 seconds
  
  let state = {
    sessions: [], // Array of { date: ISO string, seconds: number }
    scrolledTweets: [], // Array of { id: string, timestamp: number }
    engagedTweets: new Set(), // Tweet IDs engaged with
    currentSessionStart: null,
    currentSessionSeconds: 0,
    isActive: true
  };
  
  let tickTimer = null;
  let saveTimer = null;
  let lastScrollY = 0;
  let observedTweets = new Set();
  
  // ==========================================
  // Storage
  // ==========================================
  
  async function loadStats() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      if (result[STORAGE_KEY]) {
        const saved = result[STORAGE_KEY];
        state.sessions = saved.sessions || [];
        state.scrolledTweets = saved.scrolledTweets || [];
        state.engagedTweets = new Set(saved.engagedTweets || []);
        cleanOldData();
      }
    } catch (e) {
      console.log('[BetterUI] Storage not available, using memory only');
    }
  }
  
  async function saveStats() {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY]: {
          sessions: state.sessions,
          scrolledTweets: state.scrolledTweets.slice(-2000), // Keep last 2000
          engagedTweets: Array.from(state.engagedTweets).slice(-1000)
        }
      });
    } catch (e) {
      // Silent fail if storage unavailable
    }
  }
  
  function cleanOldData() {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    state.sessions = state.sessions.filter(s => new Date(s.date).getTime() > sevenDaysAgo);
    state.scrolledTweets = state.scrolledTweets.filter(t => t.timestamp > sevenDaysAgo);
  }
  
  // ==========================================
  // Time Tracking
  // ==========================================
  
  function startSession() {
    state.currentSessionStart = new Date().toISOString();
    state.currentSessionSeconds = 0;
    state.isActive = true;
    
    tickTimer = setInterval(tick, TICK_INTERVAL);
    saveTimer = setInterval(saveStats, SAVE_INTERVAL);
    
    // Track visibility
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', () => state.isActive = false);
    window.addEventListener('focus', () => state.isActive = true);
  }
  
  function tick() {
    if (state.isActive && !document.hidden) {
      state.currentSessionSeconds++;
    }
  }
  
  function handleVisibility() {
    state.isActive = !document.hidden;
  }
  
  function endSession() {
    if (tickTimer) clearInterval(tickTimer);
    if (saveTimer) clearInterval(saveTimer);
    
    if (state.currentSessionSeconds > 0) {
      state.sessions.push({
        date: state.currentSessionStart,
        seconds: state.currentSessionSeconds
      });
      saveStats();
    }
  }
  
  function getTimeStats() {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    let last24h = state.currentSessionSeconds;
    let last7d = state.currentSessionSeconds;
    
    for (const session of state.sessions) {
      const sessionTime = new Date(session.date).getTime();
      if (sessionTime > oneDayAgo) {
        last24h += session.seconds;
      }
      if (sessionTime > sevenDaysAgo) {
        last7d += session.seconds;
      }
    }
    
    return {
      last24h: formatTime(last24h),
      last7d: formatTime(last7d),
      last24hRaw: last24h,
      last7dRaw: last7d
    };
  }
  
  function formatTime(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
  
  // ==========================================
  // Engagement Tracking
  // ==========================================
  
  function trackScrolledTweet(tweetId) {
    if (tweetId) {
      // Check if already tracked
      const exists = state.scrolledTweets.some(t => t.id === tweetId);
      if (!exists) {
        state.scrolledTweets.push({
          id: tweetId,
          timestamp: Date.now()
        });
      }
    }
  }
  
  function trackEngagement(tweetId) {
    if (tweetId && !state.engagedTweets.has(tweetId)) {
      state.engagedTweets.add(tweetId);
    }
  }
  
  function getEngagementRatio() {
    const scrolled = state.scrolledTweets.length;
    const engaged = state.engagedTweets.size;
    
    if (scrolled === 0) return { ratio: 0, scrolled, engaged, display: '0%' };
    
    const ratio = engaged / scrolled;
    return {
      ratio,
      scrolled,
      engaged,
      display: `${(ratio * 100).toFixed(1)}%`
    };
  }
  
  function getScrolledTweetsCount() {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    let last24h = 0;
    let last7d = 0;
    
    for (const tweet of state.scrolledTweets) {
      if (tweet.timestamp > oneDayAgo) {
        last24h++;
      }
      if (tweet.timestamp > sevenDaysAgo) {
        last7d++;
      }
    }
    
    return { last24h, last7d };
  }
  
  // ==========================================
  // Tweet Observer
  // ==========================================
  
  function setupTweetObserver() {
    // Intersection observer to track scrolled tweets
    const scrollObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const tweet = entry.target;
          const tweetId = getTweetId(tweet);
          if (tweetId) {
            trackScrolledTweet(tweetId);
          }
        }
      });
    }, { threshold: 0.5 });
    
    // Mutation observer to catch new tweets
    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tweets = node.querySelectorAll ? 
              node.querySelectorAll('article[data-testid="tweet"]') : [];
            tweets.forEach(tweet => {
              if (!observedTweets.has(tweet)) {
                observedTweets.add(tweet);
                scrollObserver.observe(tweet);
                setupEngagementListeners(tweet);
              }
            });
            
            // Also check if the node itself is a tweet
            if (node.matches && node.matches('article[data-testid="tweet"]')) {
              if (!observedTweets.has(node)) {
                observedTweets.add(node);
                scrollObserver.observe(node);
                setupEngagementListeners(node);
              }
            }
          }
        });
      });
    });
    
    // Start observing
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    
    // Observe existing tweets
    document.querySelectorAll('article[data-testid="tweet"]').forEach(tweet => {
      if (!observedTweets.has(tweet)) {
        observedTweets.add(tweet);
        scrollObserver.observe(tweet);
        setupEngagementListeners(tweet);
      }
    });
  }
  
  function setupEngagementListeners(tweet) {
    const tweetId = getTweetId(tweet);
    if (!tweetId) return;
    
    // Track clicks on engagement buttons
    const engagementSelectors = [
      '[data-testid="like"]',
      '[data-testid="unlike"]',
      '[data-testid="retweet"]',
      '[data-testid="unretweet"]',
      '[data-testid="bookmark"]',
      '[data-testid="reply"]',
      '[data-testid="caret"]' // Share menu
    ];
    
    engagementSelectors.forEach(selector => {
      const btn = tweet.querySelector(selector);
      if (btn) {
        btn.addEventListener('click', () => trackEngagement(tweetId), { once: true });
      }
    });
  }
  
  function getTweetId(tweetElement) {
    // Try to find the tweet link which contains the status ID
    const link = tweetElement.querySelector('a[href*="/status/"]');
    if (link) {
      const match = link.href.match(/\/status\/(\d+)/);
      if (match) return match[1];
    }
    
    // Fallback: use element position as a pseudo-ID
    const time = tweetElement.querySelector('time');
    if (time) {
      return time.getAttribute('datetime');
    }
    
    return null;
  }
  
  // ==========================================
  // Public API
  // ==========================================
  
  async function init() {
    await loadStats();
    startSession();
    setupTweetObserver();
    
    window.addEventListener('beforeunload', endSession);
  }
  
  return {
    init,
    getTimeStats,
    getEngagementRatio,
    getScrolledTweetsCount,
    trackEngagement,
    getTweetId
  };
})();

// Export for use in other modules
window.BetterUIStats = BetterUIStats;

