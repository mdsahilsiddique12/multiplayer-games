console.log("Index.js initializing...");

// ===========================================================
// HELPER: HANDLE REMEMBER ME UI
// ===========================================================
window.toggleRememberMe = function() {
    const input = document.getElementById('rememberMeInput');
    const icon = document.getElementById('rememberIcon');
    const box = document.getElementById('rememberBox');
    
    // Toggle state
    input.checked = !input.checked;
    
    // Update Visuals
    if(input.checked) {
        icon.classList.remove('hidden');
        box.classList.add('bg-neon-blue/10');
    } else {
        icon.classList.add('hidden');
        box.classList.remove('bg-neon-blue/10');
    }
};

// ===========================================================
// GLOBAL WINDOW FUNCTIONS
// ===========================================================

window.openAuthModal = function() {
    const modal = document.getElementById('authModal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        
        // Reset checkbox UI based on previous preference
        const savedPref = localStorage.getItem('gn_remember') === 'true';
        document.getElementById('rememberMeInput').checked = savedPref;
        if(savedPref) {
            document.getElementById('rememberIcon').classList.remove('hidden');
        }
    }
};

window.loginGoogle = function() {
    // Save preference
    const remember = document.getElementById('rememberMeInput').checked;
    if(remember) localStorage.setItem('gn_remember', 'true');
    else localStorage.removeItem('gn_remember');

    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithRedirect(provider).catch(error => window.showToast("Login Error: " + error.message, "error"));
};

/**
 * UPDATED GUEST LOGIN
 * Enforces "One Guest Account Per Device" persistence.
 */
window.loginGuest = function() {
    // 1. Save Preference
    const remember = document.getElementById('rememberMeInput').checked;
    if(remember) localStorage.setItem('gn_remember', 'true');
    else localStorage.removeItem('gn_remember');

    // 2. Check if we already have a session (Firebase persists by default)
    const user = firebase.auth().currentUser;

    if (user) {
        // >>> CRITICAL FIX: IF USER EXISTS, DO NOT CREATE NEW ONE <<<
        window.showToast("Resuming secure guest session...", "success");
        closeAuthModal();
    } else {
        // >>> CREATE NEW ONLY IF NO SESSION EXISTS <<<
        firebase.auth().signInAnonymously()
            .then(() => window.showToast("Guest Access Granted", "success"))
            .catch(error => window.showToast("Guest Error: " + error.message, "error"));
    }
};

window.logoutUser = function() {
    if(confirm("DISCONNECT? This will delete your current Guest ID from this device.")) {
        // Clear remember preference on logout
        localStorage.removeItem('gn_remember');
        
        firebase.auth().signOut().then(() => {
            window.location.reload();
        });
    }
};

// Internal Helper to Close Modal
function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if(modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

// ===========================================================
// GAME & UPGRADE NAVIGATION
// ===========================================================
window.launchGame = function(page) {
    if (!firebase.auth().currentUser) {
        window.showToast("ACCESS DENIED: Identification Required", "error");
        window.openAuthModal();
        return;
    }
    window.location.href = page;
};

// Copy your existing buyPlan logic here
window.openUpgradeModal = function() {
    document.getElementById('upgradeModal').classList.remove('hidden');
    document.getElementById('upgradeModal').style.display = 'flex';
};
window.closeUpgradeModal = function() {
    document.getElementById('upgradeModal').classList.add('hidden');
    document.getElementById('upgradeModal').style.display = 'none';
};


// ===========================================================
// EVENT LISTENERS (Runs when page loads)
// ===========================================================
document.addEventListener("DOMContentLoaded", function() {
    
    const db = firebase.firestore();

    // --- AUTH STATE MONITOR ---
    firebase.auth().onAuthStateChanged(async (user) => {
        
        // Elements
        const authModal = document.getElementById('authModal');
        const loginBtn = document.getElementById('loginBtn');
        const userInfo = document.getElementById('userInfo');
        const userNameEl = document.getElementById('userName');
        const userCoinsEl = document.getElementById('userCoins');

        // Check "Remember Me" Preference
        const rememberPref = localStorage.getItem('gn_remember') === 'true';

        if (user) {
            // >>> USER IS AUTHENTICATED (Google or Guest) <<<
            console.log("User Session Active:", user.uid);

            // Update UI Bars
            if(loginBtn) loginBtn.classList.add('hidden');
            if(userInfo) {
                userInfo.classList.remove('hidden');
                userInfo.classList.add('flex');
            }
            if(userNameEl) userNameEl.innerText = (user.displayName || "AGENT").toUpperCase();

            // >>> LOGIC: SHOW MODAL OR AUTO-LOGIN? <<<
            if (rememberPref) {
                // Scenario A: "Remember Me" is ON. 
                // Auto-hide modal and let them play.
                closeAuthModal();
            } else {
                // Scenario B: "Remember Me" is OFF.
                // Even though Firebase has them logged in, we FORCE the modal open.
                window.openAuthModal();
                
                // Pre-check the checkbox if they toggle it now
                document.getElementById('rememberMeInput').checked = false;
                document.getElementById('rememberIcon').classList.add('hidden');
            }

            // Database Sync (Coins/Profile)
            // Only create profile if it DOES NOT exist
            const userRef = db.collection('users').doc(user.uid);
            try {
                let doc = await userRef.get();
                if (!doc.exists) {
                    await userRef.set({
                        username: user.displayName || "Agent",
                        email: user.email || "guest",
                        coins: 100,
                        xp: 0,
                        plan: 'free',
                        inventory: [],
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    doc = await userRef.get();
                }
                const data = doc.data();
                if(userCoinsEl) userCoinsEl.innerText = (data.coins || 0) + " CR";
            } catch (e) { console.error(e); }

        } else {
            // >>> NO SESSION FOUND <<<
            // DO NOT CALL signInAnonymously HERE!
            // Just show the modal and wait for user input.
            window.openAuthModal();

            // Reset UI
            if(userInfo) {
                userInfo.classList.add('hidden');
                userInfo.classList.remove('flex');
            }
            if(loginBtn) loginBtn.classList.remove('hidden');
        }
    });

});
