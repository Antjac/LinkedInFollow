document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const urlsInput = document.getElementById('urls');
    const statusDiv = document.getElementById('status');
    const progressDiv = document.getElementById('progress');
    const logsDiv = document.getElementById('logs');

    // Load saved state
    chrome.storage.local.get(['urls', 'isRunning', 'currentIndex', 'logs'], (result) => {
        if (result.urls) {
            urlsInput.value = result.urls.join('\n');
        }
        if (result.isRunning) {
            setRunningState(true);
        } else {
            setRunningState(false);
        }
        if (result.logs) {
            // Restore logs if needed, for now just clear
            logsDiv.innerHTML = '';
            result.logs.forEach(log => addLog(log.message, log.type));
        }
        updateStatus(result.currentIndex || 0, result.urls ? result.urls.length : 0);
    });

    startBtn.addEventListener('click', () => {
        let urls = urlsInput.value.split('\n').map(u => u.trim()).filter(u => u.length > 0);

        // Deduplicate URLs
        const uniqueUrls = Array.from(new Set(urls));
        const originalCount = urls.length;

        if (uniqueUrls.length === 0) {
            addLog('No URLs provided.', 'error');
            return;
        }

        if (uniqueUrls.length < originalCount) {
            addLog(`Removed ${originalCount - uniqueUrls.length} duplicate(s).`, 'info');
            urlsInput.value = uniqueUrls.join('\n');
        }

        chrome.storage.local.set({
            urls: uniqueUrls,
            isRunning: true,
            currentIndex: 0,
            logs: []
        }, () => {
            setRunningState(true);
            addLog('Starting process...', 'info');
            // Send message to background to start
            chrome.runtime.sendMessage({ action: 'START_PROCESS' });
        });
    });

    stopBtn.addEventListener('click', () => {
        chrome.storage.local.set({ isRunning: false }, () => {
            setRunningState(false);
            addLog('Process stopped by user.', 'info');
            chrome.runtime.sendMessage({ action: 'STOP_PROCESS' });
        });
    });

    // Listen for updates from background
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'UPDATE_STATUS') {
            updateStatus(message.currentIndex, message.total);
        } else if (message.action === 'LOG') {
            addLog(message.message, message.type);
        } else if (message.action === 'PROCESS_COMPLETED') {
            setRunningState(false);
            addLog('All URLs processed.', 'success');
        }
    });

    function setRunningState(isRunning) {
        startBtn.disabled = isRunning;
        stopBtn.disabled = !isRunning;
        urlsInput.disabled = isRunning;
        statusDiv.textContent = isRunning ? 'Running...' : 'Stopped';
    }

    function updateStatus(current, total) {
        progressDiv.textContent = `${current} / ${total}`;
    }

    function addLog(message, type = 'info') {
        const div = document.createElement('div');
        div.className = `log-entry log-${type}`;
        div.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logsDiv.prepend(div); // Add to top

        // Save log to storage
        chrome.storage.local.get(['logs'], (result) => {
            const logs = result.logs || [];
            logs.push({ message, type });
            chrome.storage.local.set({ logs: logs.slice(-50) }); // Keep last 50 logs
        });
    }
});
