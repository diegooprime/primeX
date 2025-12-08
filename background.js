// PrimeX Background Service Worker

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openTabs') {
    const urls = message.urls || [];
    
    // Open all tabs
    urls.forEach((url, index) => {
      chrome.tabs.create({ 
        url: url, 
        active: false // Open in background so user stays on bookmarks page
      });
    });
    
    sendResponse({ success: true, opened: urls.length });
  }
  
  return true; // Keep message channel open for async response
});
