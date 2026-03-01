// Background script for LinkedIn Follower

let processingTabId = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_PROCESS') {
        processNextUrl();
    } else if (request.action === 'STOP_PROCESS') {
        chrome.storage.local.set({ isRunning: false });
        processingTabId = null;
    } else if (request.action === 'CONTENT_SCRIPT_ACTION_COMPLETE') {
        // Ensure we only handle result for the tab we are currently processing
        if (sender.tab && sender.tab.id === processingTabId) {
            handleContentScriptResult(request.result);
            processingTabId = null; // Reset for next URL
        }
    }
});

function processNextUrl() {
    chrome.storage.local.get(['urls', 'currentIndex', 'isRunning'], (data) => {
        if (!data.isRunning) return;

        const { urls, currentIndex } = data;

        if (!urls || currentIndex >= urls.length) {
            chrome.storage.local.set({ isRunning: false });
            chrome.runtime.sendMessage({ action: 'PROCESS_COMPLETED' });
            processingTabId = null;
            return;
        }

        const url = urls[currentIndex];

        // Update popup
        chrome.runtime.sendMessage({
            action: 'UPDATE_STATUS',
            currentIndex: currentIndex + 1,
            total: urls.length
        });

        chrome.runtime.sendMessage({
            action: 'LOG',
            message: `Navigating to: ${url}`,
            type: 'info'
        });

        // Open tab
        chrome.tabs.create({ url: url, active: true }, (tab) => {
            processingTabId = tab.id;
            chrome.storage.local.set({ currentTabId: tab.id });
        });
    });
}

// Listen for tab updates to know when the page is fully loaded
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Only proceed if this is the tab we just opened and it's fully loaded
    if (changeInfo.status === 'complete' && tabId === processingTabId) {
        chrome.storage.local.get(['isRunning', 'lastProcessedIndex', 'currentIndex'], (data) => {
            // Guard: ensure we only send EXECUTE_FOLLOW ONCE per index
            if (data.isRunning && data.lastProcessedIndex !== data.currentIndex) {
                // Determine if this is a company page we want to act on

                // Inject the action trigger
                setTimeout(() => {
                    // Re-check if it's still the same tab/running
                    if (tabId === processingTabId) {
                        chrome.tabs.sendMessage(tabId, { action: 'EXECUTE_FOLLOW' }).then(() => {
                            // Mark this index as "message sent" to avoid repeating if status changes again
                            chrome.storage.local.set({ lastProcessedIndex: data.currentIndex });
                        }).catch(err => {
                            console.log("Could not send message to tab", err);
                            handleContentScriptResult('Skipped: Could not reach content script on this page');
                        });
                    }
                }, 3000); // Increased slightly for better loading with React
            }
        });
    }
});

function handleContentScriptResult(result) {
    chrome.storage.local.get(['currentIndex', 'currentTabId', 'urls'], (data) => {
        const { currentIndex, currentTabId, urls } = data;

        // Determine log type
        let logType = 'success';
        if (result.startsWith('Error')) {
            logType = 'error';
        } else if (result.startsWith('Skipped') || result.startsWith('Already Following')) {
            logType = 'info';
        }

        // Log result
        chrome.runtime.sendMessage({
            action: 'LOG',
            message: `Result for ${urls[currentIndex]}: ${result}`,
            type: logType
        });

        // Wait random time before next
        const delay = Math.floor(Math.random() * 2000) + 2000; // 2-4 seconds

        chrome.runtime.sendMessage({
            action: 'LOG',
            message: `Waiting ${delay}ms before next...`,
            type: 'info'
        });

        setTimeout(() => {
            // Close tab
            if (currentTabId) {
                chrome.tabs.remove(currentTabId).catch(() => { });
            }

            // Move to next
            chrome.storage.local.set({ currentIndex: currentIndex + 1 }, () => {
                processNextUrl();
            });
        }, delay);
    });
}
