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
    cursorTimer: null
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
      'l': () => isOnBookmarksGrid() ? navigateGrid(1) : likeFocusedTweet(),
      'g': () => scrollToTop(),
      'G': () => scrollToBottom(),
      'Enter': () => isOnBookmarksGrid() ? openFocusedBookmark() : goDeeper(),
      'Escape': () => handleEscape(),
      // Tweet actions (when focused)
      'c': () => commentOnTweet(),
      'r': () => retweetFocusedTweet(),
      'b': () => bookmarkFocusedTweet(),
      's': () => shareFocusedTweet(),
      'm': () => toggleMute(),
      'x': () => notInterestedFocusedTweet(),
    },
    
    // Leader key chords (Space + keys)
    leader: {
      'ff': () => openSearch(),
      'f': null, // Partial match for ff
      't': () => openCompose(),
      'p': () => goToProfile(),
      'a': () => handleBookmarksAction(),
      'h': () => goHome(),
      'r': () => refreshFeed(),
      '?': () => showHelp(),
    }
  };
  
  // ==========================================
  // Leader Key System
  // ==========================================
  
  function handleKeyDown(e) {
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
        console.log(`[BetterUI] Video ${video.muted ? 'muted' : 'unmuted'}`);
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
    window.history.back();
  }
  
  function likeFocusedTweet() {
    const tweet = getFocusedTweet();
    if (!tweet) return;
    
    const likeBtn = tweet.querySelector('[data-testid="like"]') || 
                    tweet.querySelector('[data-testid="unlike"]');
    
    if (likeBtn) {
      likeBtn.click();
      console.log('[BetterUI] Like toggled');
      
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
      console.log('[BetterUI] Reply clicked');
      
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
            console.log('[BetterUI] Reply box focused');
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
      console.log('[BetterUI] Retweet clicked');
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
        console.log('[BetterUI] Tweet link copied:', tweetLink.href);
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
    if (!tweet) {
      console.log('[BetterUI] No tweet focused');
      return;
    }
    
    const bookmarkBtn = tweet.querySelector('[data-testid="bookmark"]') || 
                        tweet.querySelector('[data-testid="removeBookmark"]');
    
    if (bookmarkBtn) {
      bookmarkBtn.click();
      console.log('[BetterUI] Bookmark clicked');
      
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
      openAllBookmarksInTabs();
    } else {
      // Navigate to bookmarks
      window.location.href = 'https://x.com/i/bookmarks';
    }
  }
  
  function openAllBookmarksInTabs() {
    const tweets = getTweets();
    const tweetLinks = [];
    
    tweets.forEach(tweet => {
      const link = tweet.querySelector('a[href*="/status/"] time')?.closest('a');
      if (link && link.href) {
        tweetLinks.push(link.href);
      }
    });
    
    if (tweetLinks.length === 0) {
      console.log('[BetterUI] No bookmarked tweets found');
      return;
    }
    
    console.log(`[BetterUI] Opening ${tweetLinks.length} bookmarked tweets...`);
    
    // Open each in a new tab (browser may block some due to popup blocker)
    tweetLinks.forEach((url, index) => {
      setTimeout(() => {
        window.open(url, '_blank');
      }, index * 100); // Stagger to avoid popup blocker
    });
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
            <div class="betterui-help-row"><kbd>Enter</kbd> <span>Open tweet / link</span></div>
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
            <div class="betterui-help-title">Leader Commands</div>
            <div class="betterui-help-row"><kbd>Space</kbd> <kbd>f</kbd> <kbd>f</kbd> <span>Search</span></div>
            <div class="betterui-help-row"><kbd>Space</kbd> <kbd>t</kbd> <span>Compose tweet</span></div>
            <div class="betterui-help-row"><kbd>Space</kbd> <kbd>p</kbd> <span>My profile</span></div>
            <div class="betterui-help-row"><kbd>Space</kbd> <kbd>a</kbd> <span>Bookmarks page</span></div>
            <div class="betterui-help-row"><kbd>Space</kbd> <kbd>h</kbd> <span>Home</span></div>
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
  // Initialization
  // ==========================================
  
  function init() {
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('popstate', clearFocus);
    
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
    
    console.log('[BetterUI] Keyboard shortcuts active. Press Space + ? for help.');
  }
  
  return {
    init,
    getFocusedTweet,
    clearFocus
  };
})();

window.BetterUIKeyboard = BetterUIKeyboard;
