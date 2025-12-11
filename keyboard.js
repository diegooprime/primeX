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
    leaderIndicator: null,
    searchOverlay: null,
    composeOverlay: null,
    // Bookmarks grid state
    gridFocusIndex: -1,
    // Cursor hiding
    cursorTimer: null,
    // Track navigation for back-focus prevention
    navigatedFromStatusPage: false,
    lastUrl: '',
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
      'j': () => isOnBookmarksGrid() ? navigateGrid(GRID_COLUMNS) : navigateTweets(1),
      'k': () => isOnBookmarksGrid() ? navigateGrid(-GRID_COLUMNS) : navigateTweets(-1),
      'h': () => isOnBookmarksGrid() ? navigateGrid(-1) : goBack(),
      'H': () => isOnBookmarksGrid() ? navigateGrid(-1) : goBack(),
      'l': () => isOnBookmarksGrid() ? navigateGrid(1) : likeFocusedTweet(),
      'g': () => scrollToTop(),
      'G': () => scrollToBottom(),
      'Enter': () => handleEnterKey(),
      'Escape': () => handleEscape(),
      // Tweet actions (when focused)
      'c': () => commentOnTweet(),
      'r': () => retweetFocusedTweet(),
      'b': () => bookmarkFocusedTweet(),
      's': () => shareFocusedTweet(),
      'm': () => toggleMute(),
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
      'h': () => goHome(),
      'H': () => goHome(),
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
      activateLeader();
      return;
    }
    
    // If leader is active, buffer the key
    if (state.leaderActive) {
      e.preventDefault();
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
    
    // Direct bindings
    const directAction = bindings.direct[e.key];
    if (directAction) {
      e.preventDefault();
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
  
  function handleEnterKey() {
    if (isOnBookmarksGrid()) {
      openFocusedBookmark();
    } else if (isOnProfilePage()) {
      // On profile pages, Enter always toggles follow/unfollow
      // (regardless of tweet focus - user can click tweets to open them)
      // Wait at least 1 second after entering profile to prevent accidental follows
      const timeOnProfile = Date.now() - state.profileEnteredAt;
      if (timeOnProfile > 1000) {
        toggleFollow();
      }
    } else {
      goDeeper();
    }
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
  
  function retweetFocusedTweet() {
    const tweet = getFocusedTweet();
    if (!tweet) return;
    
    const retweetBtn = tweet.querySelector('[data-testid="retweet"]') ||
                       tweet.querySelector('[data-testid="unretweet"]');
    if (retweetBtn) {
      retweetBtn.click();
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
    
    // Priority 1: Quoted tweet
    const quotedTweet = tweet.querySelector('[data-testid="quoteTweet"] a[href*="/status/"]');
    if (quotedTweet) {
      quotedTweet.click();
      return;
    }
    
    // Priority 2: External link card
    const cardLink = tweet.querySelector('[data-testid="card.wrapper"] a[href]');
    if (cardLink && !cardLink.href.includes('x.com') && !cardLink.href.includes('twitter.com')) {
      cardLink.click();
      return;
    }
    
    // Priority 3: Tweet detail
    const tweetLink = tweet.querySelector('a[href*="/status/"] time')?.closest('a');
    if (tweetLink) {
      tweetLink.click();
      return;
    }
    
    // Priority 4: Author profile
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
            <div class="betterui-help-row"><kbd>Enter</kbd> <span>Open tweet / Follow on profile</span></div>
            <div class="betterui-help-row"><kbd>Esc</kbd> <span>Clear focus / Close dialogs</span></div>
          </div>
          <div class="betterui-help-section">
            <div class="betterui-help-title">Tweet Actions</div>
            <div class="betterui-help-row"><kbd>c</kbd> <span>Comment / Reply</span></div>
            <div class="betterui-help-row"><kbd>r</kbd> <span>Retweet</span></div>
            <div class="betterui-help-row"><kbd>b</kbd> <span>Bookmark</span></div>
            <div class="betterui-help-row"><kbd>s</kbd> <span>Share (copy link)</span></div>
            <div class="betterui-help-row"><kbd>m</kbd> <span>Mute / unmute video</span></div>
            <div class="betterui-help-row"><kbd>x</kbd> <span>Not interested</span></div>
          </div>
          <div class="betterui-help-section">
            <div class="betterui-help-title">Profile Page</div>
            <div class="betterui-help-row"><kbd>Enter</kbd> <span>Follow / Unfollow</span></div>
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
            <div class="betterui-help-row"><kbd>Space</kbd> <kbd>h</kbd> <span>Home</span></div>
            <div class="betterui-help-row"><kbd>Space</kbd> <kbd>n</kbd> <span>Notifications</span></div>
            <div class="betterui-help-row"><kbd>Space</kbd> <kbd>r</kbd> <span>Refresh feed</span></div>
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
    // Skip auto-focus if navigating back from a status page
    if (state.navigatedFromStatusPage) {
      state.navigatedFromStatusPage = false;
      return;
    }
    
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
    document.addEventListener('keydown', handleKeyDown);
    
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
      
      // If we were on status page and now we're not, skip auto-focus
      if (wasOnStatusPage && !isNowOnStatusPage) {
        state.navigatedFromStatusPage = true;
      }
      
      // Track when entering a profile page
      if (isOnProfilePage()) {
        state.profileEnteredAt = Date.now();
      }
      
      state.lastUrl = window.location.href;
      clearFocus();
      // Re-check for auto-focus on navigation
      setTimeout(autoFocusTweet, 300);
    });
    
    const observer = new MutationObserver(() => {
      if (state.focusedTweet && !document.contains(state.focusedTweet)) {
        state.focusedTweet = null;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Check for pending tweet to post (from compose dialog)
    setTimeout(checkPendingTweet, 500);
    
    // Initialize cursor hiding
    initCursorHiding();
    
    // Auto-focus tweet if on status page
    setTimeout(autoFocusTweet, 500);
    
    // Also listen for URL changes (Twitter is a SPA)
    const urlObserver = new MutationObserver(() => {
      if (window.location.href !== state.lastUrl) {
        const wasOnStatusPage = /\/status\/\d+/.test(state.lastUrl);
        const isNowOnStatusPage = /\/status\/\d+/.test(window.location.pathname);
        const wasOnProfilePage = isOnProfilePage();
        
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
        setTimeout(autoFocusTweet, 300);
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
