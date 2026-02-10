// Content script for LinkedIn Follower

console.log('LinkedIn Follower Content Script Loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'EXECUTE_FOLLOW') {
        console.log('Received EXECUTE_FOLLOW command');
        attemptFollow();
    }
});

function attemptFollow() {
    // Selectors for the "Follow" button
    const possibleTexts = ['Follow', 'Suivre', 'S’abonner', 'Connect', 'Se connecter'];
    const alreadyFollowedTexts = ['Following', 'Déjà suivi', 'Abonné', 'Pending', 'En attente', 'Message'];

    // Helper to clean text
    const clean = (text) => text.trim();

    // Try to find the "Top Card" or main area to avoid sidebars
    // For Companies: .org-top-card, .org-top-card-primary-actions__inner
    // For Profiles: .pv-top-card, section.artdeco-card
    const mainContainers = [
        '.org-top-card',
        '.pv-top-card',
        '.pv-top-card--list',
        'main section.artdeco-card',
        '.scaffold-layout__main'
    ];

    let mainArea = null;
    for (const selector of mainContainers) {
        const el = document.querySelector(selector);
        if (el) {
            mainArea = el;
            break;
        }
    }

    // If no specific main area found, use search restricted to EXCLUDING sidebars
    const root = mainArea || document;

    // Find all buttons within the restricted area
    const buttons = Array.from(root.querySelectorAll('button'));

    // Exclude buttons that are inside containers clearly marked as "Also viewed" or sidebars
    const filteredButtons = buttons.filter(b => {
        // Exclude if inside an aside or a sidebar-like class
        const isAside = b.closest('aside') || b.closest('.scaffold-layout__aside') || b.closest('.aside');
        if (isAside) return false;

        // Exclude if inside "People also viewed" type sections
        const innerText = b.closest('section')?.innerText || '';
        if (innerText.includes('Pages people also viewed') || innerText.includes('Pages également consultées')) {
            return false;
        }

        return true;
    });

    // Check for "Already Followed" first among filtered buttons
    const alreadyFollowing = filteredButtons.find(b => {
        const text = clean(b.innerText);
        const label = b.getAttribute('aria-label') || '';
        return alreadyFollowedTexts.some(t => text === t || label.includes(t));
    });

    if (alreadyFollowing) {
        console.log('Already following or action not needed');
        chrome.runtime.sendMessage({ action: 'CONTENT_SCRIPT_ACTION_COMPLETE', result: 'Already Following' });
        return;
    }

    // Try to find the Follow button
    let followBtn = filteredButtons.find(b => {
        const text = clean(b.innerText);
        const label = b.getAttribute('aria-label') || '';
        // We want exact match for "Follow" to avoid "Followers" etc, but "Follow [Company]" is common in aria-label
        return possibleTexts.some(t => text === t) || possibleTexts.some(t => label.startsWith(t + ' '));
    });

    if (followBtn) {
        console.log('Found main Follow button', followBtn);
        followBtn.click();

        setTimeout(() => {
            chrome.runtime.sendMessage({ action: 'CONTENT_SCRIPT_ACTION_COMPLETE', result: 'Followed' });
        }, 1000);
    } else {
        console.log('Main Follow button not found.');
        chrome.runtime.sendMessage({ action: 'CONTENT_SCRIPT_ACTION_COMPLETE', result: 'Error: Main button not found' });
    }
}
