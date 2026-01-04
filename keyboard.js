// BetterUI Keyboard Module - Vim-like navigation and leader key

const BetterUIKeyboard = (function() {
  const LEADER_KEY = ' '; // Space
  const LEADER_TIMEOUT = 1500; // ms to complete chord after leader
  const MY_PROFILE = 'https://x.com/diegooprime';
  
  let state = {
    leaderActive: false,
    leaderBuffer: '',
    leaderTimer: null,
    focusedTweet: null,
    focusedMedia: null,
    leaderIndicator: null,
    searchOverlay: null,
    composeOverlay: null,
    // Bookmarks grid state
    gridFocusIndex: -1,
    // Profile media grid state
    mediaFocusIndex: -1,
    // Cursor hiding
    cursorTimer: null,
    // Track navigation for back-focus prevention
    navigatedFromStatusPage: false,
    lastUrl: '',
    // Track the tweet URL we came from (for restoring focus after going back)
    lastFocusedTweetUrl: null,
    // Track previous page for proper back navigation (avoid Twitter SPA refresh)
    previousPageUrl: null,
    previousScrollY: 0,
    // Track when we entered a profile page to prevent auto-follow
    profileEnteredAt: 0,
    // Debounce for follow/unfollow actions
    lastFollowAction: 0
  };
  
  const GRID_COLUMNS = 5;
  
  // ==========================================
  // Key Bindings
  // ==========================================
  
  const bindings = {
    // Direct bindings (no leader) - vim style hjkl
    direct: {
      'j': () => isOnBookmarksGrid() ? navigateGrid(GRID_COLUMNS) : (isOnProfileMediaGrid() ? navigateMediaGrid(1) : navigateTweets(1)),
      'k': () => isOnBookmarksGrid() ? navigateGrid(-GRID_COLUMNS) : (isOnProfileMediaGrid() ? navigateMediaGrid(-1) : navigateTweets(-1)),
      'h': () => isOnBookmarksGrid() ? navigateGrid(-1) : goBack(),
      'H': () => isOnBookmarksGrid() ? navigateGrid(-1) : goBack(),
      'l': () => isOnBookmarksGrid() ? navigateGrid(1) : likeFocusedTweet(),
      'g': () => scrollToTop(),
      'G': () => scrollToBottom(),
      'Enter': () => handleEnterKey(),
      'Tab': () => goToAuthorProfile(),
      'Escape': () => handleEscape(),
      // Tweet actions (when focused)
      'c': () => commentOnTweet(),
      'r': () => retweetFocusedTweet(),
      'b': () => bookmarkFocusedTweet(),
      's': () => shareFocusedTweet(),
      'm': () => toggleMute(),
      'i': () => openTweetMedia(),
      'x': () => notInterestedFocusedTweet(),
      // Profile tab navigation (1-4 only work on profile pages)
      '1': () => navigateProfileTab(0), // Posts
      '2': () => navigateProfileTab(1), // Replies
      '3': () => navigateProfileTab(2), // Media
      '4': () => navigateProfileTab(3), // Likes
    },
    
    // Leader key chords (Space + keys)
    leader: {
      'ff': () => openSearch(),
      'f': null, // Partial match for ff
      't': () => openCompose(),
      'p': () => goToProfile(),
      'a': () => handleBookmarksAction(),
      'o': () => isOnBookmarksPage() ? openAllBookmarksNow() : null,
      'r': () => refreshFeed(),
      'n': () => goToNotifications(),
      '?': () => showHelp(),
    }
  };
  
  // ==========================================
  // Leader Key System
  // ==========================================
  
  function handleKeyDown(e) {
    // Allow browser shortcuts through (Cmd+Shift+R, Cmd+R, Ctrl+Shift+R, etc.)
    if (e.metaKey || e.ctrlKey) {
      // Don't intercept any keyboard shortcuts with Cmd/Ctrl modifiers
      return;
    }
    
    // Handle search overlay
    if (state.searchOverlay?.classList.contains('active')) {
      if (e.key === 'Escape') {
        closeSearch();
        e.preventDefault();
      }
      return;
    }
    
    // Handle compose overlay
    if (state.composeOverlay?.classList.contains('active')) {
      if (e.key === 'Escape') {
        closeCompose();
        e.preventDefault();
      }
      return;
    }

    // Handle media lightbox (image viewer)
    if (isMediaLightboxOpen()) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (e.key === 'h' || e.key === 'H') {
        // Previous image
        navigateLightbox('prev');
      } else if (e.key === 'l' || e.key === 'L') {
        // Next image
        navigateLightbox('next');
      } else if (e.key === 'Escape') {
        // Close lightbox
        closeLightbox();
      }
      return;
    }

    // Ignore if typing in input
    if (isTyping(e.target)) {
      if (e.key === 'Escape') {
        e.target.blur();
        e.preventDefault();
      }
      return;
    }
    
    // Leader key pressed
    if (e.key === LEADER_KEY && !state.leaderActive) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      activateLeader();
      return;
    }
    
    // If leader is active, buffer the key
    if (state.leaderActive) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      state.leaderBuffer += e.key;
      updateLeaderIndicator();
      
      // Check if buffer matches a binding
      const action = bindings.leader[state.leaderBuffer];
      if (action) {
        action();
        deactivateLeader();
        return;
      }
      
      // Check if buffer could still match something
      const couldMatch = Object.keys(bindings.leader).some(
        key => key.startsWith(state.leaderBuffer) && key !== state.leaderBuffer
      );
      
      if (!couldMatch) {
        deactivateLeader();
      }
      return;
    }
    
    // Special case: Shift+Enter opens tweet in new tab (preserves timeline)
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      openTweetInNewTab();
      return;
    }

    // Direct bindings
    const directAction = bindings.direct[e.key];
    if (directAction) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      directAction();
    }
  }
  
  function activateLeader() {
    state.leaderActive = true;
    state.leaderBuffer = '';
    showLeaderIndicator();
    
    // Clear any existing timer first
    if (state.leaderTimer) {
      clearTimeout(state.leaderTimer);
    }
    
    state.leaderTimer = setTimeout(() => {
      deactivateLeader();
    }, LEADER_TIMEOUT);
  }
  
  function deactivateLeader() {
    state.leaderActive = false;
    state.leaderBuffer = '';
    if (state.leaderTimer) {
      clearTimeout(state.leaderTimer);
      state.leaderTimer = null;
    }
    hideLeaderIndicator();
  }
  
  function isTyping(element) {
    const tagName = element.tagName.toLowerCase();
    const isEditable = element.isContentEditable;
    const isInput = tagName === 'input' || tagName === 'textarea';
    const isTwitterCompose = element.closest('[data-testid="tweetTextarea_0"]');
    const isSearchInput = element.id === 'betterui-search-input';
    const isComposeInput = element.id === 'betterui-compose-input';
    
    // Check if reply modal is open
    const replyModalOpen = document.querySelector('[aria-labelledby="modal-header"]') ||
                           document.querySelector('[data-testid="reply"]')?.closest('[role="dialog"]');
    
    return isEditable || isInput || isTwitterCompose || isSearchInput || isComposeInput || replyModalOpen;
  }
  
  function handleEscape() {
    if (state.searchOverlay?.classList.contains('active')) {
      closeSearch();
    } else if (state.composeOverlay?.classList.contains('active')) {
      closeCompose();
    } else {
      clearFocus();
    }
  }

  // ==========================================
  // Media Lightbox Handling
  // ==========================================

  function isMediaLightboxOpen() {
    // Twitter's media lightbox is in #layers and contains specific elements
    const layers = document.getElementById('layers');
    if (!layers) return false;

    // Check for image lightbox indicators
    const hasLightbox = layers.querySelector('[aria-label="Image"]') ||
                        layers.querySelector('[aria-label="Enlarge image"]') ||
                        layers.querySelector('[data-testid="swipe-to-dismiss"]') ||
                        layers.querySelector('img[src*="pbs.twimg.com/media"]');

    return !!hasLightbox;
  }

  function navigateLightbox(direction) {
    const layers = document.getElementById('layers');
    if (!layers) return;

    // Find navigation buttons by aria-label
    const prevBtn = layers.querySelector('[aria-label="Previous slide"]') ||
                    layers.querySelector('[aria-label="Previous"]') ||
                    layers.querySelector('[data-testid="prevButton"]');
    const nextBtn = layers.querySelector('[aria-label="Next slide"]') ||
                    layers.querySelector('[aria-label="Next"]') ||
                    layers.querySelector('[data-testid="nextButton"]');

    if (direction === 'prev' && prevBtn) {
      prevBtn.click();
    } else if (direction === 'next' && nextBtn) {
      nextBtn.click();
    }
  }

  function closeLightbox() {
    // Try multiple methods to close the lightbox
    const layers = document.getElementById('layers');
    if (!layers) return;

    // Method 1: Click the close button
    const closeBtn = layers.querySelector('[aria-label="Close"]') ||
                     layers.querySelector('[data-testid="close"]') ||
                     layers.querySelector('[aria-label="Close photo"]');
    if (closeBtn) {
      closeBtn.click();
      return;
    }

    // Method 2: Click the backdrop/overlay area
    const backdrop = layers.querySelector('[data-testid="swipe-to-dismiss"]') ||
                     layers.querySelector('[role="presentation"]');
    if (backdrop) {
      backdrop.click();
      return;
    }

    // Method 3: Simulate Escape key to Twitter
    const escEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true
    });
    document.body.dispatchEvent(escEvent);
  }
  
  // ==========================================
  // Leader Indicator UI
  // ==========================================
  
  function createLeaderIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'betterui-leader';
    indicator.innerHTML = '<span class="label">LEADER</span> <span class="keys"></span>';
    document.body.appendChild(indicator);
    state.leaderIndicator = indicator;
  }
  
  function showLeaderIndicator() {
    if (!state.leaderIndicator) createLeaderIndicator();
    state.leaderIndicator.classList.add('active');
    updateLeaderIndicator();
  }
  
  function hideLeaderIndicator() {
    if (state.leaderIndicator) {
      state.leaderIndicator.classList.remove('active');
    }
  }
  
  function updateLeaderIndicator() {
    if (state.leaderIndicator) {
      const keysSpan = state.leaderIndicator.querySelector('.keys');
      keysSpan.textContent = state.leaderBuffer || '_';
    }
  }
  
  // ==========================================
  // Tweet Navigation
  // ==========================================
  
  function getTweets() {
    return Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
  }
  
  function navigateTweets(direction) {
    const tweets = getTweets();
    if (tweets.length === 0) return;
    
    let currentIndex = -1;
    if (state.focusedTweet && document.contains(state.focusedTweet)) {
      currentIndex = tweets.indexOf(state.focusedTweet);
    }
    
    // If we have a focused tweet, check if it's long and needs internal scrolling
    if (state.focusedTweet && currentIndex !== -1) {
      const scrollResult = scrollWithinTweet(state.focusedTweet, direction);
      if (scrollResult) {
        // Successfully scrolled within the tweet, don't navigate to next/prev
        return;
      }
    }
    
    if (state.focusedTweet) {
      state.focusedTweet.classList.remove('betterui-focused');
    }
    
    let newIndex;
    if (currentIndex === -1) {
      newIndex = findFirstVisibleTweetIndex(tweets);
    } else {
      newIndex = currentIndex + direction;
    }
    
    newIndex = Math.max(0, Math.min(newIndex, tweets.length - 1));
    
    const tweet = tweets[newIndex];
    if (tweet) {
      state.focusedTweet = tweet;
      tweet.classList.add('betterui-focused');
      
      const rect = tweet.getBoundingClientRect();
      const targetY = window.scrollY + rect.top - 20;
      
      window.scrollTo({
        top: targetY,
        behavior: 'smooth'
      });
    }
  }
  
  // Scroll within a long tweet - returns true if scrolled, false if at edge
  function scrollWithinTweet(tweet, direction) {
    const rect = tweet.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const scrollStep = Math.floor(viewportHeight * 0.6); // Scroll by 60% of viewport
    const edgeThreshold = 30; // How close to edge before moving to next tweet
    
    // Only apply internal scrolling if tweet is taller than viewport
    if (rect.height <= viewportHeight - 40) {
      return false;
    }
    
    if (direction > 0) {
      // Scrolling down (j key)
      // Check if the bottom of the tweet is below the viewport
      if (rect.bottom > viewportHeight + edgeThreshold) {
        // Still more content below - scroll down within the tweet
        window.scrollBy({
          top: scrollStep,
          behavior: 'smooth'
        });
        return true;
      }
      // Tweet bottom is visible, navigate to next tweet
      return false;
    } else {
      // Scrolling up (k key)
      // Check if the top of the tweet is above the viewport
      if (rect.top < -edgeThreshold) {
        // Still more content above - scroll up within the tweet
        window.scrollBy({
          top: -scrollStep,
          behavior: 'smooth'
        });
        return true;
      }
      // Tweet top is visible, navigate to previous tweet
      return false;
    }
  }
  
  function findFirstVisibleTweetIndex(tweets) {
    const viewportTop = 50;
    
    for (let i = 0; i < tweets.length; i++) {
      const rect = tweets[i].getBoundingClientRect();
      if (rect.bottom > viewportTop && rect.top < window.innerHeight) {
        return i;
      }
    }
    return 0;
  }
  
  function clearFocus() {
    if (state.focusedTweet) {
      state.focusedTweet.classList.remove('betterui-focused');
      state.focusedTweet = null;
    }
    clearMediaFocus();
    // Also clear grid focus
    clearGridFocus();
  }
  
  function clearGridFocus() {
    state.gridFocusIndex = -1;
    const cards = document.querySelectorAll('.betterui-bookmark-card');
    cards.forEach(c => c.classList.remove('focused'));
  }
  
  function getFocusedTweet() {
    if (state.focusedTweet && document.contains(state.focusedTweet)) {
      return state.focusedTweet;
    }
    return null;
  }
  
  function findTweetByUrl(url) {
    if (!url) return null;
    
    // Extract status ID from URL (handles variations like /photo/1, /video/1, etc.)
    const statusMatch = url.match(/\/status\/(\d+)/);
    if (!statusMatch) return null;
    const statusId = statusMatch[1];
    
    const tweets = getTweets();
    for (const tweet of tweets) {
      const tweetLink = tweet.querySelector('a[href*="/status/"] time')?.closest('a');
      if (tweetLink?.href && tweetLink.href.includes(`/status/${statusId}`)) {
        return tweet;
      }
    }
    return null;
  }
  
  function focusTweet(tweet) {
    if (!tweet) return false;
    
    if (state.focusedTweet) {
      state.focusedTweet.classList.remove('betterui-focused');
    }
    
    state.focusedTweet = tweet;
    tweet.classList.add('betterui-focused');
    
    // Scroll to the tweet
    const rect = tweet.getBoundingClientRect();
    const targetY = window.scrollY + rect.top - 20;
    
    window.scrollTo({
      top: targetY,
      behavior: 'smooth'
    });
    
    return true;
  }
  
  function restoreFocusToLastTweet() {
    if (!state.lastFocusedTweetUrl) return false;
    
    const tweet = findTweetByUrl(state.lastFocusedTweetUrl);
    if (tweet) {
      focusTweet(tweet);
      return true;
    }
    return false;
  }
  
  // ==========================================
  // Bookmarks Grid Navigation
  // ==========================================
  
  function isOnBookmarksGrid() {
    return window.location.pathname === '/i/bookmarks' && 
           document.getElementById('betterui-bookmarks-grid');
  }
  
  function isOnBookmarksPage() {
    return window.location.pathname === '/i/bookmarks';
  }
  
  function isOnProfilePage() {
    const path = window.location.pathname;
    // Profile pages: /username, /username/with_replies, /username/media, /username/likes
    // But NOT /i/*, /home, /search, /compose, status pages, etc.
    return /^\/[a-zA-Z0-9_]+($|\/with_replies|\/media|\/likes|\/highlights)/.test(path) &&
           !path.startsWith('/i/') &&
           !path.startsWith('/home') &&
           !path.startsWith('/search') &&
           !path.startsWith('/compose') &&
           !path.startsWith('/settings') &&
           !path.startsWith('/messages') &&
           !/\/status\//.test(path);
  }

  // ==========================================
  // Profile Media Grid Navigation (/username/media)
  // ==========================================

  function isOnProfileMediaGrid() {
    const path = window.location.pathname;
    // Match /username/media but not /status/ pages
    if (!/^\/[a-zA-Z0-9_]+\/media(\/|$)/.test(path)) return false;
    if (/\/status\//.test(path)) return false;
    return true;
  }

  function getProfileMediaItems() {
    const primaryColumn = document.querySelector('[data-testid="primaryColumn"]');
    if (!primaryColumn) return [];

    // Find all tweetPhoto and videoPlayer elements - these are the clickable media items
    const photos = Array.from(primaryColumn.querySelectorAll('[data-testid="tweetPhoto"]'));
    const videos = Array.from(primaryColumn.querySelectorAll('[data-testid="videoPlayer"]'));
    const allMedia = [...photos, ...videos];
    
    // Filter to visible items not in lightbox
    return allMedia.filter(el => {
      if (el.closest('#layers')) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 20 && rect.height > 20;
    });
  }

  function findFirstVisibleMediaIndex(items) {
    const viewportTop = 50;
    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      if (rect.bottom > viewportTop && rect.top < window.innerHeight) {
        return i;
      }
    }
    return 0;
  }

  function clearMediaFocus() {
    state.mediaFocusIndex = -1;
    if (state.focusedMedia && document.contains(state.focusedMedia)) {
      state.focusedMedia.classList.remove('betterui-media-focused');
    }
    state.focusedMedia = null;

    // Clean up any stale focus classes
    document.querySelectorAll('.betterui-media-focused').forEach(el => {
      el.classList.remove('betterui-media-focused');
    });
  }

  function focusMediaItem(el, index) {
    if (!el) return false;
    clearFocus(); // clears tweet/grid/media focus

    state.focusedMedia = el;
    state.mediaFocusIndex = index;
    el.classList.add('betterui-media-focused');

    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    return true;
  }

  function navigateMediaGrid(direction) {
    const items = getProfileMediaItems();
    if (items.length === 0) return;

    let currentIndex = -1;

    if (state.focusedMedia && document.contains(state.focusedMedia)) {
      const idx = items.indexOf(state.focusedMedia);
      if (idx !== -1) currentIndex = idx;
    }

    if (currentIndex === -1) {
      currentIndex = findFirstVisibleMediaIndex(items);
    }

    let newIndex = currentIndex + direction;
    newIndex = Math.max(0, Math.min(newIndex, items.length - 1));
    focusMediaItem(items[newIndex], newIndex);
  }

  function openFocusedMediaItem() {
    if (!state.focusedMedia || !document.contains(state.focusedMedia)) return false;
    
    // Find clickable element - the tweetPhoto/videoPlayer or a link inside it
    const clickTarget = state.focusedMedia.querySelector('a') || 
                        state.focusedMedia.querySelector('img') ||
                        state.focusedMedia;
    clickTarget.click();
    return true;
  }
  
  function handleEnterKey() {
    if (isOnBookmarksGrid()) {
      openFocusedBookmark();
      return;
    }

    // Profile media grid: Enter opens the focused thumbnail (never follow/unfollow)
    if (isOnProfileMediaGrid()) {
      if (openFocusedMediaItem()) return;

      const items = getProfileMediaItems();
      if (items.length > 0) {
        const idx = findFirstVisibleMediaIndex(items);
        focusMediaItem(items[idx], idx);
      }
      return;
    }
    
    // If there's a focused tweet, always go deeper (nested content first)
    const focusedTweet = getFocusedTweet();
    if (focusedTweet) {
      goDeeper();
      return;
    }
    
    // On profile pages with no focused tweet, Enter toggles follow/unfollow
    if (isOnProfilePage()) {
      const timeOnProfile = Date.now() - state.profileEnteredAt;
      if (timeOnProfile > 1000) {
        toggleFollow();
      }
      return;
    }
    
    // Fallback: try to go deeper anyway
    goDeeper();
  }
  
  function toggleFollow() {
    // Debounce - prevent multiple rapid clicks
    const now = Date.now();
    if (now - state.lastFollowAction < 2000) {
      return; // Ignore if last action was less than 2 seconds ago
    }
    state.lastFollowAction = now;
    
    // Find the follow/unfollow button on the profile page
    const primaryColumn = document.querySelector('[data-testid="primaryColumn"]');
    if (!primaryColumn) return;
    
    // Method 1: Look for buttons with specific data-testid (most reliable)
    // Twitter uses testids like "1234567-follow" or "1234567-unfollow"
    let followBtn = primaryColumn.querySelector('[data-testid$="-follow"]');
    let unfollowBtn = primaryColumn.querySelector('[data-testid$="-unfollow"]');
    
    // Skip if inside modals/articles
    if (followBtn?.closest('[aria-modal="true"]') || followBtn?.closest('article')) followBtn = null;
    if (unfollowBtn?.closest('[aria-modal="true"]') || unfollowBtn?.closest('article')) unfollowBtn = null;
    
    // Method 2: Fallback to text-based detection
    if (!followBtn && !unfollowBtn) {
      const allButtons = primaryColumn.querySelectorAll('[role="button"]');
      
      for (const btn of allButtons) {
        // Skip if it's inside a modal/dialog
        if (btn.closest('[aria-modal="true"]') || btn.closest('[role="dialog"]')) continue;
        // Skip if inside an article (tweet actions)
        if (btn.closest('article')) continue;
        // Skip if inside layers (popups)
        if (btn.closest('#layers')) continue;
        
        const text = btn.textContent.trim().toLowerCase();
        const testId = btn.getAttribute('data-testid') || '';
        const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        
        // Skip subscribe-related buttons
        if (text.includes('subscribe') || testId.toLowerCase().includes('subscribe')) continue;
        
        // Check for "follow" or "following" in text or aria-label
        if (text === 'follow' || ariaLabel.includes('follow') && !ariaLabel.includes('following')) {
          followBtn = btn;
        } else if (text === 'following' || ariaLabel.includes('following')) {
          unfollowBtn = btn;
        }
      }
    }
    
    // If we found an unfollow/following button, user is following -> unfollow
    if (unfollowBtn) {
      clickUnfollow(unfollowBtn);
    } else if (followBtn) {
      // If we found a "Follow" button, user is not following -> follow
      clickFollow(followBtn);
    }
  }
  
  function clickFollow(btn) {
    btn.click();
    showPostingIndicator('Followed!');
    hidePostingIndicator();
  }
  
  function clickUnfollow(btn) {
    btn.click();
    
    // Twitter shows a confirmation dialog - auto-confirm it
    setTimeout(() => {
      // Find the confirmation "Unfollow" button in the dialog
      const confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
      if (confirmBtn) {
        confirmBtn.click();
        showPostingIndicator('Unfollowed!');
        hidePostingIndicator();
        return;
      }
      
      // Fallback: look for button containing "Unfollow" text in dialog
      const dialog = document.querySelector('[role="dialog"]') || document.querySelector('[aria-modal="true"]');
      if (dialog) {
        const buttons = dialog.querySelectorAll('[role="button"]');
        for (const btn of buttons) {
          if (btn.textContent.trim().toLowerCase() === 'unfollow') {
            btn.click();
            showPostingIndicator('Unfollowed!');
            hidePostingIndicator();
            return;
          }
        }
      }
    }, 150);
  }
  
  function getProfileUsername() {
    const path = window.location.pathname;
    const match = path.match(/^\/([a-zA-Z0-9_]+)/);
    return match ? match[1] : null;
  }
  
  function navigateProfileTab(tabIndex) {
    if (!isOnProfilePage()) return;
    
    const username = getProfileUsername();
    if (!username) return;
    
    const tabs = [
      `/${username}`,           // 1 = Posts
      `/${username}/with_replies`, // 2 = Replies
      `/${username}/media`,     // 3 = Media
      `/${username}/likes`      // 4 = Likes
    ];
    
    if (tabIndex >= 0 && tabIndex < tabs.length) {
      window.location.href = `https://x.com${tabs[tabIndex]}`;
    }
  }
  
  function getGridCards() {
    const grid = document.getElementById('betterui-bookmarks-grid');
    if (!grid) return [];
    return Array.from(grid.querySelectorAll('.betterui-bookmark-card'));
  }
  
  function navigateGrid(delta) {
    const cards = getGridCards();
    if (cards.length === 0) return;
    
    // Clear previous focus
    cards.forEach(c => c.classList.remove('focused'));
    
    // Calculate new index
    if (state.gridFocusIndex === -1) {
      state.gridFocusIndex = 0;
    } else {
      state.gridFocusIndex += delta;
    }
    
    // Clamp to bounds
    state.gridFocusIndex = Math.max(0, Math.min(state.gridFocusIndex, cards.length - 1));
    
    // Focus the card
    const card = cards[state.gridFocusIndex];
    if (card) {
      card.classList.add('focused');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
  
  function openFocusedBookmark() {
    const cards = getGridCards();
    if (state.gridFocusIndex >= 0 && cards[state.gridFocusIndex]) {
      const url = cards[state.gridFocusIndex].dataset.url;
      if (url) {
        window.location.href = url;
      }
    }
  }
  
  // ==========================================
  // Search Dialog
  // ==========================================
  
  function createSearchOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'betterui-search-overlay';
    overlay.className = 'betterui-overlay';
    overlay.innerHTML = `
      <div class="betterui-dialog">
        <input type="text" id="betterui-search-input" class="betterui-dialog-input" placeholder="Search Twitter..." autofocus>
        <div class="betterui-dialog-hint">Enter to search · Esc to close</div>
      </div>
    `;
    document.body.appendChild(overlay);
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSearch();
    });
    
    const input = overlay.querySelector('#betterui-search-input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        const query = encodeURIComponent(input.value.trim());
        window.location.href = `https://x.com/search?q=${query}&src=typed_query`;
      }
    });
    
    state.searchOverlay = overlay;
    return overlay;
  }
  
  function openSearch() {
    if (!state.searchOverlay) createSearchOverlay();
    state.searchOverlay.classList.add('active');
    const input = state.searchOverlay.querySelector('#betterui-search-input');
    input.value = '';
    setTimeout(() => input.focus(), 10);
  }
  
  function closeSearch() {
    if (state.searchOverlay) {
      state.searchOverlay.classList.remove('active');
    }
  }
  
  // ==========================================
  // Compose Dialog (Custom)
  // ==========================================
  
  function createComposeOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'betterui-compose-overlay';
    overlay.className = 'betterui-overlay';
    overlay.innerHTML = `
      <div class="betterui-dialog betterui-compose-dialog">
        <textarea id="betterui-compose-input" class="betterui-dialog-textarea" placeholder="What's happening?" autofocus></textarea>
        <div class="betterui-compose-footer">
          <span class="betterui-char-count">0/280</span>
          <button id="betterui-compose-btn" class="betterui-compose-button">Post</button>
        </div>
        <div class="betterui-dialog-hint">Cmd+Enter to post · Esc to close</div>
      </div>
    `;
    document.body.appendChild(overlay);
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeCompose();
    });
    
    const textarea = overlay.querySelector('#betterui-compose-input');
    const charCount = overlay.querySelector('.betterui-char-count');
    const postBtn = overlay.querySelector('#betterui-compose-btn');
    
    textarea.addEventListener('input', () => {
      const len = textarea.value.length;
      charCount.textContent = `${len}/280`;
      charCount.classList.toggle('over', len > 280);
      postBtn.disabled = len === 0 || len > 280;
    });
    
    textarea.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        submitTweet(textarea.value);
      }
    });
    
    postBtn.addEventListener('click', () => {
      submitTweet(textarea.value);
    });
    
    state.composeOverlay = overlay;
    return overlay;
  }
  
  function openCompose() {
    if (!state.composeOverlay) createComposeOverlay();
    state.composeOverlay.classList.add('active');
    const textarea = state.composeOverlay.querySelector('#betterui-compose-input');
    textarea.value = '';
    const charCount = state.composeOverlay.querySelector('.betterui-char-count');
    charCount.textContent = '0/280';
    charCount.classList.remove('over');
    setTimeout(() => textarea.focus(), 10);
  }
  
  function closeCompose() {
    if (state.composeOverlay) {
      state.composeOverlay.classList.remove('active');
    }
  }
  
  function submitTweet(text) {
    if (!text.trim() || text.length > 280) return;
    
    const tweetText = text.trim();
    closeCompose();
    
    // Store the text to inject after navigation
    sessionStorage.setItem('betterui_pending_tweet', tweetText);
    sessionStorage.setItem('betterui_return_url', window.location.href);
    
    // Navigate to compose page
    window.location.href = 'https://x.com/compose/post';
  }
  
  // Check if we need to inject a pending tweet (called on page load)
  function checkPendingTweet() {
    const pendingTweet = sessionStorage.getItem('betterui_pending_tweet');
    if (!pendingTweet) return;
    
    // Clear it so we don't keep trying
    sessionStorage.removeItem('betterui_pending_tweet');
    const returnUrl = sessionStorage.getItem('betterui_return_url');
    sessionStorage.removeItem('betterui_return_url');
    
    // Wait for compose box to be ready
    const checkInterval = setInterval(() => {
      const composeBox = document.querySelector('[data-testid="tweetTextarea_0"]');
      
      if (composeBox) {
        clearInterval(checkInterval);
        
        // Focus the compose box
        composeBox.focus();
        
        // Small delay then insert text
        setTimeout(() => {
          // Try to find the actual editable element
          const editableDiv = composeBox.querySelector('[contenteditable="true"]') || 
                              composeBox.closest('[contenteditable="true"]') ||
                              document.querySelector('[data-testid="tweetTextarea_0"] [contenteditable="true"]') ||
                              composeBox;
          
          if (editableDiv) {
            editableDiv.focus();
            
            // Insert text using execCommand
            document.execCommand('insertText', false, pendingTweet);
            
            // Also try setting textContent as fallback
            if (!editableDiv.textContent) {
              editableDiv.textContent = pendingTweet;
              editableDiv.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }
          
          // Show helper message
          showPostingIndicator('Press Cmd+Enter or click Post');
          
          // Auto-click post after a delay if button is enabled
          setTimeout(() => {
            const postBtn = document.querySelector('[data-testid="tweetButton"]');
            if (postBtn && !postBtn.disabled && postBtn.getAttribute('aria-disabled') !== 'true') {
              postBtn.click();
              showPostingIndicator('Posted!');
              
              // Go back after posting
              setTimeout(() => {
                hidePostingIndicator();
                if (returnUrl) {
                  window.location.href = returnUrl;
                } else {
                  window.history.back();
                }
              }, 800);
            } else {
              hidePostingIndicator();
            }
          }, 800);
        }, 300);
      }
    }, 100);
    
    // Timeout
    setTimeout(() => clearInterval(checkInterval), 5000);
  }
  
  function showPostingIndicator(message) {
    let indicator = document.getElementById('betterui-posting');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'betterui-posting';
      indicator.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #21252b;
        color: #98c379;
        padding: 12px 24px;
        border-radius: 8px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 13px;
        z-index: 99999;
        border: 1px solid #98c379;
      `;
      document.body.appendChild(indicator);
    }
    indicator.textContent = message || 'Posting...';
  }
  
  function hidePostingIndicator() {
    setTimeout(() => {
      const indicator = document.getElementById('betterui-posting');
      if (indicator) indicator.remove();
    }, 2000);
  }
  
  // ==========================================
  // Scroll Position Restoration (for back navigation)
  // ==========================================

  function checkPendingScrollRestore() {
    const savedTweetUrl = sessionStorage.getItem('betterui_restore_tweet');
    const savedScrollY = sessionStorage.getItem('betterui_restore_scroll');

    if (!savedTweetUrl) return;

    // Clear immediately so we don't keep trying on subsequent navigations
    sessionStorage.removeItem('betterui_restore_scroll');
    sessionStorage.removeItem('betterui_restore_tweet');

    const targetScrollY = savedScrollY ? parseInt(savedScrollY, 10) : 0;

    // Wait for tweets to load, then try to find and focus the tweet
    let attempts = 0;
    const maxAttempts = 50; // Try for up to 5 seconds (Twitter can be slow)
    let foundTweet = false;

    const tryRestore = () => {
      attempts++;

      // Try to find the tweet by its URL
      const tweet = findTweetByUrl(savedTweetUrl);
      if (tweet) {
        foundTweet = true;
        focusTweet(tweet);
        return; // Success!
      }

      // If we have a saved scroll position and haven't found the tweet yet,
      // try scrolling to that position (might help load more tweets)
      if (targetScrollY > 0 && attempts < 10) {
        window.scrollTo(0, targetScrollY);
      }

      // Keep trying as Twitter might still be loading tweets
      if (attempts < maxAttempts) {
        setTimeout(tryRestore, 100);
      } else if (!foundTweet) {
        // Give up - tweet not found in refreshed timeline
        // Just focus the first visible tweet as fallback
        const tweets = getTweets();
        if (tweets.length > 0) {
          const firstVisibleIndex = findFirstVisibleTweetIndex(tweets);
          if (tweets[firstVisibleIndex]) {
            state.focusedTweet = tweets[firstVisibleIndex];
            tweets[firstVisibleIndex].classList.add('betterui-focused');
          }
        }
      }
    };

    // Start trying after a short delay for initial page render
    setTimeout(tryRestore, 150);
  }

  // ==========================================
  // Video Mute/Unmute
  // ==========================================

  function toggleMute() {
    // Find any playing video on the page
    const videos = document.querySelectorAll('video');
    
    for (const video of videos) {
      // Check if video is visible/playing
      const rect = video.getBoundingClientRect();
      const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
      
      if (isVisible) {
        video.muted = !video.muted;
        return;
      }
    }
    
    // Fallback: Try clicking Twitter's mute button
    const muteBtn = document.querySelector('[data-testid="videoPlayer"] button[aria-label*="ute"]') ||
                    document.querySelector('[aria-label="Unmute"]') ||
                    document.querySelector('[aria-label="Mute"]');
    if (muteBtn) {
      muteBtn.click();
    }
  }
  
  // ==========================================
  // Actions
  // ==========================================
  
  function goBack() {
    // Mark that we're navigating back - to prevent auto-focus
    state.navigatedFromStatusPage = /\/status\/\d+/.test(window.location.pathname);

    // Save the tweet URL we want to return to (for finding it after going back)
    if (state.navigatedFromStatusPage && state.lastFocusedTweetUrl) {
      sessionStorage.setItem('betterui_restore_tweet', state.lastFocusedTweetUrl);
      if (state.previousScrollY) {
        sessionStorage.setItem('betterui_restore_scroll', state.previousScrollY.toString());
      }
    }

    // Use browser history back - better chance of Twitter using cached content
    window.history.back();
  }
  
  function likeFocusedTweet() {
    const tweet = getFocusedTweet();
    if (!tweet) return;
    
    const likeBtn = tweet.querySelector('[data-testid="like"]') || 
                    tweet.querySelector('[data-testid="unlike"]');
    
    if (likeBtn) {
      likeBtn.click();
      
      if (window.BetterUIStats) {
        const tweetId = window.BetterUIStats.getTweetId(tweet);
        if (tweetId) window.BetterUIStats.trackEngagement(tweetId);
      }
    }
  }
  
  function commentOnTweet() {
    const tweet = getFocusedTweet();
    if (!tweet) return;
    
    const replyBtn = tweet.querySelector('[data-testid="reply"]');
    if (replyBtn) {
      replyBtn.click();
      
      // Keep trying to focus the reply box until it appears
      let attempts = 0;
      const focusInterval = setInterval(() => {
        attempts++;
        
        // Look for the reply modal's text area
        const modal = document.querySelector('[aria-labelledby="modal-header"]');
        if (modal) {
          // Find the editable area in the modal
          const editable = modal.querySelector('[contenteditable="true"]') ||
                          modal.querySelector('[data-testid="tweetTextarea_0"]') ||
                          modal.querySelector('[role="textbox"]');
          
          if (editable) {
            // Click on it first to ensure focus
            editable.click();
            editable.focus();
            
            // Also try to place cursor
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(editable);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
            
            clearInterval(focusInterval);
          }
        }
        
        // Give up after 3 seconds
        if (attempts > 30) {
          clearInterval(focusInterval);
        }
      }, 100);
    }
  }
  
  function openTweetMedia() {
    const tweet = getFocusedTweet();
    if (!tweet) return;

    // Find images or videos in the tweet
    const media = tweet.querySelector('[data-testid="tweetPhoto"]') ||
                  tweet.querySelector('[data-testid="videoPlayer"]') ||
                  tweet.querySelector('img[src*="pbs.twimg.com/media"]');

    if (media) {
      // Click to open lightbox
      media.click();
    } else {
      showPostingIndicator('No media');
      hidePostingIndicator();
    }
  }

  function retweetFocusedTweet() {
    const tweet = getFocusedTweet();
    if (!tweet) return;

    const retweetBtn = tweet.querySelector('[data-testid="retweet"]');
    const unretweetBtn = tweet.querySelector('[data-testid="unretweet"]');

    if (unretweetBtn) {
      // Already retweeted - undo retweet
      unretweetBtn.click();
      setTimeout(() => {
        // Find and click "Undo repost" in the menu
        const menuItems = document.querySelectorAll('[role="menuitem"]');
        for (const item of menuItems) {
          if (item.textContent.toLowerCase().includes('undo')) {
            item.click();
            showPostingIndicator('Unreposted!');
            hidePostingIndicator();
            return;
          }
        }
      }, 150);
    } else if (retweetBtn) {
      // Not retweeted yet - repost
      retweetBtn.click();
      setTimeout(() => {
        // Find and click "Repost" in the menu
        const menuItems = document.querySelectorAll('[role="menuitem"]');
        for (const item of menuItems) {
          if (item.textContent.toLowerCase() === 'repost') {
            item.click();
            showPostingIndicator('Reposted!');
            hidePostingIndicator();
            return;
          }
        }
      }, 150);
    }
  }
  
  function shareFocusedTweet() {
    const tweet = getFocusedTweet();
    if (!tweet) return;
    
    // Get tweet URL
    const tweetLink = tweet.querySelector('a[href*="/status/"] time')?.closest('a');
    if (tweetLink && tweetLink.href) {
      // Copy to clipboard
      navigator.clipboard.writeText(tweetLink.href).then(() => {
        showPostingIndicator('Link copied!');
        hidePostingIndicator();
      }).catch(() => {
        // Fallback: click share button
        const shareBtn = tweet.querySelector('[aria-label="Share post"]') ||
                         tweet.querySelector('[data-testid="share"]');
        if (shareBtn) shareBtn.click();
      });
    }
  }
  
  function goDeeper() {
    const tweet = getFocusedTweet();
    if (!tweet) return;
    
    // Helper to extract status ID from any URL or string
    const getStatusId = (str) => str?.match(/\/status\/(\d+)/)?.[1];
    
    const toAbsXUrl = (href) => {
      if (!href) return null;
      if (href.startsWith('http://') || href.startsWith('https://')) return href;
      if (href.startsWith('/')) return `https://x.com${href}`;
      return href;
    };
    
    // Find the main status link (the timestamp link)
    const mainTimeLink = tweet.querySelector('a[href*="/status/"] time')?.closest('a');
    const mainStatusId = getStatusId(mainTimeLink?.getAttribute('href') || mainTimeLink?.href || '');
    const currentPageStatusId = getStatusId(window.location.pathname);
    
    const navigateToStatusLink = (linkEl) => {
      if (!linkEl) return false;
      
      const href = linkEl.getAttribute?.('href') || linkEl.href;
      const id = getStatusId(href || '');
      if (!id) return false;
      
      // Never "navigate to self"
      if (id === mainStatusId || id === currentPageStatusId) return false;
      
      // Guardrails: only real status links, never intent links
      const hrefStr = String(href || '');
      if (!hrefStr.includes('/status/') || hrefStr.includes('/intent/')) return false;
      
      const url = toAbsXUrl(hrefStr);
      if (!url) return false;
      
      window.location.href = url;
      return true;
    };
    
    // ========================================
    // STEP 1: If not on this tweet's detail page yet, go there first
    // ========================================
    if (mainStatusId && mainStatusId !== currentPageStatusId) {
      const mainHref = mainTimeLink.getAttribute('href') || mainTimeLink.href;
      if (mainHref) {
        // Save current page state before navigating (for proper back navigation)
        state.previousPageUrl = window.location.href;
        state.previousScrollY = window.scrollY;

        state.lastFocusedTweetUrl = toAbsXUrl(mainHref);
        if (state.lastFocusedTweetUrl) {
          window.location.href = state.lastFocusedTweetUrl;
          return;
        }
      }
    }

    // ========================================
    // STEP 2: Already viewing this tweet's detail page - do nothing
    // ========================================
    // If we're on the detail page of the focused tweet, don't try to "go deeper"
    // into quoted tweets. User is already where they want to be.
    if (mainStatusId && mainStatusId === currentPageStatusId) {
      // Already viewing this tweet - no action needed
      return;
    }

    // ========================================
    // STEP 3: We're on a different tweet's page - look for nested content
    // ========================================
    // This handles the case where you're viewing a reply thread and focus on a
    // tweet that has a quoted tweet inside it.

    // 1. Prefer the quoted tweet permalink (the <a> wrapping a <time>) inside quote container
    const quotedContainer = tweet.querySelector('[data-testid="quoteTweet"], [data-testid="quote"]');
    const quotedTimeLink = quotedContainer?.querySelector('a[href*="/status/"] time')?.closest('a');
    if (navigateToStatusLink(quotedTimeLink)) return;

    // 2. Next: look for any additional tweet permalinks (time links) inside this tweet
    // This catches embedded quoted tweets even if the container testid changes.
    const embeddedTimeLinks = Array.from(tweet.querySelectorAll('a[href*="/status/"] time'))
      .map((t) => t.closest('a'))
      .filter(Boolean);

    for (const link of embeddedTimeLinks) {
      if (navigateToStatusLink(link)) return;
    }

    // 3. Fallback: Search all links in the tweet for ANY other status ID
    const allLinks = tweet.querySelectorAll('a[href*="/status/"]');
    for (const link of allLinks) {
      if (navigateToStatusLink(link)) return;
    }

    // 4. Check for external link cards
    const cardLink = tweet.querySelector('[data-testid="card.wrapper"] a[href]');
    if (cardLink) {
      const href = cardLink.getAttribute('href');
      if (href && !href.includes('x.com') && !href.includes('twitter.com')) {
        window.location.href = href;
        return;
      }
    }

    // No nested content and not on this tweet's page yet - navigate to it
    if (mainStatusId) {
      const mainHref = mainTimeLink.getAttribute('href') || mainTimeLink.href;
      if (mainHref) {
        state.previousPageUrl = window.location.href;
        state.previousScrollY = window.scrollY;
        state.lastFocusedTweetUrl = toAbsXUrl(mainHref);
        if (state.lastFocusedTweetUrl) {
          window.location.href = state.lastFocusedTweetUrl;
          return;
        }
      }
    }
  }

  function openTweetInNewTab() {
    const tweet = getFocusedTweet();
    if (!tweet) return;

    // Find the tweet's URL
    const tweetLink = tweet.querySelector('a[href*="/status/"] time')?.closest('a');
    if (tweetLink?.href) {
      // Open in new tab - this preserves the current tab's timeline
      window.open(tweetLink.href, '_blank');
      showPostingIndicator('Opened in new tab');
      hidePostingIndicator();
    }
  }

  function goToAuthorProfile() {
    const tweet = getFocusedTweet();
    if (!tweet) return;
    
    // Save the current tweet URL so we can restore focus when going back
    const currentTweetLink = tweet.querySelector('a[href*="/status/"] time')?.closest('a');
    if (currentTweetLink?.href) {
      state.lastFocusedTweetUrl = currentTweetLink.href;
    }
    
    // Find the author's profile link
    const profileLink = tweet.querySelector('[data-testid="User-Name"] a[href^="/"]');
    if (profileLink) {
      profileLink.click();
    }
  }
  
  function goToProfile() {
    window.location.href = MY_PROFILE;
  }
  
  function bookmarkFocusedTweet() {
    const tweet = getFocusedTweet();
    if (!tweet) return;
    
    const bookmarkBtn = tweet.querySelector('[data-testid="bookmark"]') || 
                        tweet.querySelector('[data-testid="removeBookmark"]');
    
    if (bookmarkBtn) {
      bookmarkBtn.click();
      
      if (window.BetterUIStats) {
        const tweetId = window.BetterUIStats.getTweetId(tweet);
        if (tweetId) window.BetterUIStats.trackEngagement(tweetId);
      }
      return;
    }
    
    // Fallback via share menu
    const shareBtn = tweet.querySelector('[aria-label="Share post"]') ||
                     tweet.querySelector('[data-testid="share"]');
    if (shareBtn) {
      shareBtn.click();
      setTimeout(() => {
        const menuItems = document.querySelectorAll('[role="menuitem"]');
        for (const item of menuItems) {
          if (item.textContent.toLowerCase().includes('bookmark')) {
            item.click();
            return;
          }
        }
        document.body.click();
      }, 150);
    }
  }
  
  function notInterestedFocusedTweet() {
    const tweet = getFocusedTweet();
    if (!tweet) return;
    
    const caretBtn = tweet.querySelector('[data-testid="caret"]') ||
                     tweet.querySelector('[aria-label="More"]');
    if (caretBtn) {
      caretBtn.click();
      setTimeout(() => {
        const menuItems = document.querySelectorAll('[role="menuitem"]');
        for (const item of menuItems) {
          const text = item.textContent.toLowerCase();
          if (text.includes('not interested') || text.includes("don't like")) {
            item.click();
            break;
          }
        }
      }, 150);
    }
  }
  
function handleBookmarksAction() {
  // If on bookmarks page, open all in new tabs
  if (window.location.pathname === '/i/bookmarks') {
    openAllBookmarksNow();
  } else {
    // Navigate to bookmarks
    window.location.href = 'https://x.com/i/bookmarks';
  }
}
  
  function simulateRealClick(element) {
    // Simulate a real user click with all necessary events
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const eventOptions = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: centerX,
      clientY: centerY,
      screenX: centerX,
      screenY: centerY,
      button: 0,
      buttons: 1
    };
    
    element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
    element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
    element.dispatchEvent(new MouseEvent('click', eventOptions));
  }

  function openAllBookmarksNow() {
    // Temporarily disable the grid to show native timeline
    const body = document.body;
    const hadGridActive = body.classList.contains('betterui-grid-active');
    
    if (hadGridActive) {
      body.classList.remove('betterui-grid-active');
    }
    
    // Wait a moment for the DOM to update
    setTimeout(() => {
      const tweets = getTweets();
      const tweetLinks = [];
      const removeBookmarkBtns = [];
      
      tweets.forEach(tweet => {
        const link = tweet.querySelector('a[href*="/status/"] time')?.closest('a');
        if (link && link.href) {
          tweetLinks.push(link.href);
          // Collect the remove bookmark button for each tweet
          const removeBtn = tweet.querySelector('[data-testid="removeBookmark"]');
          if (removeBtn) {
            removeBookmarkBtns.push(removeBtn);
          }
        }
      });
      
      if (tweetLinks.length === 0) {
        if (hadGridActive) {
          body.classList.add('betterui-grid-active');
        }
        showPostingIndicator('No bookmarks found');
        hidePostingIndicator();
        return;
      }
      
      showPostingIndicator(`Opening ${tweetLinks.length} tabs...`);
      
      // Use Chrome extension API to open tabs
      chrome.runtime.sendMessage(
        { action: 'openTabs', urls: tweetLinks },
        (response) => {
          if (response && response.success) {
            showPostingIndicator(`Opened ${response.opened} tabs! Unbookmarking...`);
            
            // Unbookmark all tweets with a delay between each
            removeBookmarkBtns.forEach((btn, index) => {
              setTimeout(() => {
                // Scroll the button into view first
                btn.scrollIntoView({ block: 'center', behavior: 'instant' });
                setTimeout(() => {
                  simulateRealClick(btn);
                }, 50);
              }, index * 300); // 300ms delay between each unbookmark
            });
            
            // Show final message after all unbookmarks are done
            const totalTime = removeBookmarkBtns.length * 300 + 500;
            setTimeout(() => {
              if (hadGridActive) {
                body.classList.add('betterui-grid-active');
              }
              showPostingIndicator(`Opened ${response.opened} tabs & unbookmarked!`);
              hidePostingIndicator();
            }, totalTime);
          } else {
            if (hadGridActive) {
              body.classList.add('betterui-grid-active');
            }
            showPostingIndicator('Failed to open tabs');
            hidePostingIndicator();
          }
        }
      );
    }, 100);
  }
  
  
  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    clearFocus();
  }
  
  function scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }
  
  function refreshFeed() {
    // Always go to home and reload
    if (window.location.pathname === '/home') {
      window.location.reload();
    } else {
      window.location.href = 'https://x.com/home';
    }
  }
  
  function goHome() {
    window.location.href = 'https://x.com/home';
  }
  
  function goToNotifications() {
    window.location.href = 'https://x.com/i/notifications';
  }
  
  function showHelp() {
    // Remove existing help if open
    const existing = document.getElementById('betterui-help-overlay');
    if (existing) {
      existing.remove();
      return;
    }
    
    const overlay = document.createElement('div');
    overlay.id = 'betterui-help-overlay';
    overlay.className = 'betterui-overlay active';
    overlay.innerHTML = `
      <div class="betterui-help-dialog">
        <div class="betterui-help-header">
          <span>Keyboard Shortcuts</span>
          <span class="betterui-help-close">Esc to close</span>
        </div>
        <div class="betterui-help-content">
          <div class="betterui-help-section">
            <div class="betterui-help-title">Navigation</div>
            <div class="betterui-help-row"><kbd>j</kbd> <span>Next tweet</span></div>
            <div class="betterui-help-row"><kbd>k</kbd> <span>Previous tweet</span></div>
            <div class="betterui-help-row"><kbd>h</kbd> <span>Go back</span></div>
            <div class="betterui-help-row"><kbd>l</kbd> <span>Like tweet</span></div>
            <div class="betterui-help-row"><kbd>g</kbd> <span>Scroll to top</span></div>
            <div class="betterui-help-row"><kbd>G</kbd> <span>Scroll to bottom</span></div>
            <div class="betterui-help-row"><kbd>Enter</kbd> <span>View tweet (navigates away)</span></div>
            <div class="betterui-help-row"><kbd>Shift</kbd>+<kbd>Enter</kbd> <span>Open in new tab (preserves timeline)</span></div>
            <div class="betterui-help-row"><kbd>Tab</kbd> <span>Go to author's profile</span></div>
            <div class="betterui-help-row"><kbd>Esc</kbd> <span>Home (refresh)</span></div>
          </div>
          <div class="betterui-help-section">
            <div class="betterui-help-title">Tweet Actions</div>
            <div class="betterui-help-row"><kbd>c</kbd> <span>Comment / Reply</span></div>
            <div class="betterui-help-row"><kbd>r</kbd> <span>Retweet</span></div>
            <div class="betterui-help-row"><kbd>b</kbd> <span>Bookmark</span></div>
            <div class="betterui-help-row"><kbd>s</kbd> <span>Share (copy link)</span></div>
            <div class="betterui-help-row"><kbd>m</kbd> <span>Mute / unmute video</span></div>
            <div class="betterui-help-row"><kbd>i</kbd> <span>Open image/media</span></div>
            <div class="betterui-help-row"><kbd>x</kbd> <span>Not interested</span></div>
          </div>
          <div class="betterui-help-section">
            <div class="betterui-help-title">Image Viewer</div>
            <div class="betterui-help-row"><kbd>h</kbd> <span>Previous image</span></div>
            <div class="betterui-help-row"><kbd>l</kbd> <span>Next image</span></div>
            <div class="betterui-help-row"><kbd>Esc</kbd> <span>Close viewer</span></div>
          </div>
          <div class="betterui-help-section">
            <div class="betterui-help-title">Profile Page</div>
            <div class="betterui-help-row"><kbd>Enter</kbd> <span>Follow/Unfollow (when no tweet focused)</span></div>
            <div class="betterui-help-row"><kbd>1</kbd> <span>Posts tab</span></div>
            <div class="betterui-help-row"><kbd>2</kbd> <span>Replies tab</span></div>
            <div class="betterui-help-row"><kbd>3</kbd> <span>Media tab</span></div>
            <div class="betterui-help-row"><kbd>4</kbd> <span>Likes tab</span></div>
          </div>
          <div class="betterui-help-section">
            <div class="betterui-help-title">Leader Commands</div>
            <div class="betterui-help-row"><kbd>Space</kbd> <kbd>f</kbd> <kbd>f</kbd> <span>Search</span></div>
            <div class="betterui-help-row"><kbd>Space</kbd> <kbd>t</kbd> <span>Compose tweet</span></div>
            <div class="betterui-help-row"><kbd>Space</kbd> <kbd>p</kbd> <span>My profile</span></div>
            <div class="betterui-help-row"><kbd>Space</kbd> <kbd>a</kbd> <span>Bookmarks page</span></div>
            <div class="betterui-help-row"><kbd>Space</kbd> <kbd>o</kbd> <span>Open all bookmarks in tabs</span></div>
            <div class="betterui-help-row"><kbd>Space</kbd> <kbd>r</kbd> <span>Refresh / Go home</span></div>
            <div class="betterui-help-row"><kbd>Space</kbd> <kbd>n</kbd> <span>Notifications</span></div>
            <div class="betterui-help-row"><kbd>Space</kbd> <kbd>?</kbd> <span>Show help</span></div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Close on click outside or Escape
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    
    const closeOnEscape = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', closeOnEscape);
      }
    };
    document.addEventListener('keydown', closeOnEscape);
  }
  
  // ==========================================
  // Cursor Hiding
  // ==========================================
  
  const CURSOR_HIDE_DELAY = 1500; // ms of inactivity before hiding cursor
  
  function initCursorHiding() {
    // Start with cursor hidden
    document.body.classList.add('betterui-hide-cursor');
    
    document.addEventListener('mousemove', showCursor);
    document.addEventListener('mousedown', showCursor);
  }
  
  function showCursor() {
    // Show cursor
    document.body.classList.remove('betterui-hide-cursor');
    
    // Clear existing timer
    if (state.cursorTimer) {
      clearTimeout(state.cursorTimer);
    }
    
    // Set timer to hide cursor after delay
    state.cursorTimer = setTimeout(() => {
      document.body.classList.add('betterui-hide-cursor');
    }, CURSOR_HIDE_DELAY);
  }
  
  // ==========================================
  // Auto-focus Tweet on Page Load
  // ==========================================
  
  function shouldAutoFocus() {
    const path = window.location.pathname;
    // Auto-focus on: tweet pages, home, timeline, profile pages
    return /\/status\/\d+/.test(path) || 
           path === '/home' || 
           path === '/' ||
           /^\/[^/]+$/.test(path); // Profile pages like /username
  }
  
  function autoFocusTweet() {
    if (!shouldAutoFocus()) return;
    
    // Wait for the tweet to load and focus it
    const attemptFocus = () => {
      const tweets = getTweets();
      if (tweets.length > 0) {
        // Focus the first tweet (the main tweet on a status page)
        const tweet = tweets[0];
        if (state.focusedTweet) {
          state.focusedTweet.classList.remove('betterui-focused');
        }
        state.focusedTweet = tweet;
        tweet.classList.add('betterui-focused');
        return true;
      }
      return false;
    };
    
    // Try immediately
    if (attemptFocus()) return;
    
    // Retry a few times if tweet hasn't loaded yet
    let attempts = 0;
    const maxAttempts = 20;
    const interval = setInterval(() => {
      attempts++;
      if (attemptFocus() || attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 100);
  }
  
  // ==========================================
  // Initialization
  // ==========================================
  
  function init() {
    // Capture phase so we beat Twitter/React key handlers (prevents Enter from falling through to profile navigation)
    window.addEventListener('keydown', handleKeyDown, true);
    
    // Track current URL for back navigation detection
    state.lastUrl = window.location.href;
    // Initialize profile timestamp if starting on a profile
    if (isOnProfilePage()) {
      state.profileEnteredAt = Date.now();
    }
    
    window.addEventListener('popstate', () => {
      // Detect if we're going back from a status page
      const wasOnStatusPage = /\/status\/\d+/.test(state.lastUrl);
      const isNowOnStatusPage = /\/status\/\d+/.test(window.location.pathname);
      
      // When navigating TO a status page, save the status URL for later
      if (!wasOnStatusPage && isNowOnStatusPage) {
        state.lastFocusedTweetUrl = window.location.href;
      }
      
      // If we were on status page and now we're not, try to restore focus
      if (wasOnStatusPage && !isNowOnStatusPage) {
        state.navigatedFromStatusPage = true;
      }
      
      // Track when entering a profile page
      if (isOnProfilePage()) {
        state.profileEnteredAt = Date.now();
      }
      
      state.lastUrl = window.location.href;
      clearFocus();
      
      // If coming back from a status page, restore focus to the tweet we came from
      if (state.navigatedFromStatusPage && state.lastFocusedTweetUrl) {
        // Try multiple times as tweets may need to load
        let attempts = 0;
        const maxAttempts = 20;
        const tryRestore = () => {
          attempts++;
          if (restoreFocusToLastTweet()) {
            state.navigatedFromStatusPage = false;
            return;
          }
          if (attempts < maxAttempts) {
            setTimeout(tryRestore, 150);
          } else {
            // Give up and fall back to auto-focus
            state.navigatedFromStatusPage = false;
            autoFocusTweet();
          }
        };
        setTimeout(tryRestore, 100);
      } else {
        // Re-check for auto-focus on navigation
        setTimeout(autoFocusTweet, 300);
      }
    });
    
    const observer = new MutationObserver(() => {
      if (state.focusedTweet && !document.contains(state.focusedTweet)) {
        state.focusedTweet = null;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Check for pending tweet to post (from compose dialog)
    setTimeout(checkPendingTweet, 500);

    // Check for pending scroll restoration (from back navigation)
    setTimeout(checkPendingScrollRestore, 100);
    
    // Initialize cursor hiding
    initCursorHiding();
    
    // Auto-focus tweet if on status page
    setTimeout(autoFocusTweet, 500);
    
    // Also listen for URL changes (Twitter is a SPA)
    const urlObserver = new MutationObserver(() => {
      if (window.location.href !== state.lastUrl) {
        const wasOnStatusPage = /\/status\/\d+/.test(state.lastUrl);
        const isNowOnStatusPage = /\/status\/\d+/.test(window.location.pathname);
        
        // When navigating TO a status page, save the status URL for later
        // This handles both keyboard and click navigation
        if (!wasOnStatusPage && isNowOnStatusPage) {
          state.lastFocusedTweetUrl = window.location.href;
        }
        
        // Track if navigating away from status page (likely going back)
        if (wasOnStatusPage && !isNowOnStatusPage) {
          state.navigatedFromStatusPage = true;
        }
        
        state.lastUrl = window.location.href;
        
        // Track when entering a profile page (after URL update)
        if (isOnProfilePage()) {
          state.profileEnteredAt = Date.now();
        }
        
        clearFocus();
        
        // If coming back from a status page, restore focus to the tweet we came from
        if (state.navigatedFromStatusPage && state.lastFocusedTweetUrl) {
          // Try multiple times as tweets may need to load
          let attempts = 0;
          const maxAttempts = 20;
          const tryRestore = () => {
            attempts++;
            if (restoreFocusToLastTweet()) {
              state.navigatedFromStatusPage = false;
              return;
            }
            if (attempts < maxAttempts) {
              setTimeout(tryRestore, 150);
            } else {
              // Give up and fall back to auto-focus
              state.navigatedFromStatusPage = false;
              autoFocusTweet();
            }
          };
          setTimeout(tryRestore, 100);
        } else {
          setTimeout(autoFocusTweet, 300);
        }
      }
    });
    urlObserver.observe(document.body, { childList: true, subtree: true });
  }
  
  return {
    init,
    getFocusedTweet,
    clearFocus
  };
})();

window.BetterUIKeyboard = BetterUIKeyboard;
