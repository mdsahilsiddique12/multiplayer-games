console.log("Index.js initializing...");

document.addEventListener("DOMContentLoaded", function() {
    
    const db = firebase.firestore();

    // -------------------------------------------------------------
    // 1. HANDLE RETURN FROM GOOGLE LOGIN (The Redirect Fix)
    // -------------------------------------------------------------
    firebase.auth().getRedirectResult()
        .then((result) => {
            if (result.user) {
                console.log("✅ Redirect Login Successful! User:", result.user.uid);
                window.showToast("Welcome back, Agent.", "success");
            }
        })
        .catch((error) => {
            // Ignore standard "popup closed" or "cancelled" errors to keep UI clean
            if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
                console.error("❌ Login Failed:", error.message);
                window.showToast("Login Protocol Failed: " + error.message, "error");
            }
        });

    // -------------------------------------------------------------
    // 2. AUTH STATE MONITOR (The Core Logic)
    // -------------------------------------------------------------
    firebase.auth().onAuthStateChanged(async (user) => {
        
        // UI Elements
        const authModal = document.getElementById('authModal');
        const loginBtn = document.getElementById('loginBtn');
        const userInfo = document.getElementById('userInfo');
        const userNameEl = document.getElementById('userName');
        const userCoinsEl = document.getElementById('userCoins');

        // Check "Remember Me" Preference
        const rememberPref = localStorage.getItem('gn_remember') === 'true';

        if (user) {
            // >>> USER IS LOGGED IN <<<
            console.log("User Session Active:", user.uid);

            // A. Update UI immediately
            if(loginBtn) loginBtn.classList.add('hidden');
            if(userInfo) {
                userInfo.classList.remove('hidden');
                userInfo.classList.add('flex');
            }
            if(userNameEl) userNameEl.innerText = (user.displayName || "AGENT").toUpperCase();

            // B. Handle Modal Behavior
            if (rememberPref) {
                closeAuthModal(); // Auto-close if they asked to remember
            } else {
                // Optional: If you want to FORCE the modal open even if logged in 
                // (until they click "Play"), keep this. Otherwise, usually we close it.
                // window.openAuthModal(); 
                closeAuthModal(); // Standard behavior: Close modal if logged in.
            }

            // C. Database Sync (Create Profile if New)
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
                    doc = await userRef.get(); // Refresh doc
                }
                
                // Update Coins Display
                const data = doc.data();
                if(userCoinsEl) userCoinsEl.innerText = (data.coins || 0) + " CR";
                
            } catch (e) { 
                console.error("Database Sync Error:", e); 
            }

        } else {
            // >>> USER IS LOGGED OUT <<<
            console.log("No active session.");

            // A. Reset UI
            if(userInfo) {
                userInfo.classList.add('hidden');
                userInfo.classList.remove('flex');
            }
            if(loginBtn) loginBtn.classList.remove('hidden');

            // B. Open Login Modal automatically
            window.openAuthModal();
        }
    });
});

// ===========================================================
// GLOBAL WINDOW FUNCTIONS (Called by HTML Buttons)
// ===========================================================

/**
 * 1. GOOGLE LOGIN (Redirect Method)
 * Fixes cross-origin errors on all browsers.
 */
window.loginGoogle = function() {
    // Save "Remember Me" preference
    saveRememberMePref();

    const provider = new firebase.auth.GoogleAuthProvider();
    // Use Redirect instead of Popup to avoid browser blocking
    firebase.auth().signInWithRedirect(provider);
};

/**
 * 2. GUEST LOGIN
 * Prevents duplicate guest accounts on refresh.
 */
window.loginGuest = function() {
    saveRememberMePref();

    const user = firebase.auth().currentUser;

    if (user) {
        window.showToast("Session already active.", "info");
        closeAuthModal();
    } else {
        firebase.auth().signInAnonymously()
            .then(() => window.showToast("Guest Access Granted", "success"))
            .catch(error => window.showToast("Guest Error: " + error.message, "error"));
    }
};

/**
 * 3. LOGOUT
 */
window.logoutUser = function() {
    if(confirm("Disconnect from Game Nexus?")) {
        localStorage.removeItem('gn_remember');
        firebase.auth().signOut().then(() => {
            window.location.reload();
        });
    }
};

// --- HELPER: Save Checkbox State ---
function saveRememberMePref() {
    const checkbox = document.getElementById('rememberMeInput');
    if(checkbox && checkbox.checked) {
        localStorage.setItem('gn_remember', 'true');
    } else {
        localStorage.removeItem('gn_remember');
    }
}

// ===========================================================
// UI MANAGERS (Modals & Toggles)
// ===========================================================

window.openAuthModal = function() {
    const modal = document.getElementById('authModal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        
        // Restore Checkbox State
        const savedPref = localStorage.getItem('gn_remember') === 'true';
        const checkbox = document.getElementById('rememberMeInput');
        if(checkbox) {
            checkbox.checked = savedPref;
            window.toggleRememberMe(true); // Update visual style
        }
    }
};

function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if(modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

window.toggleRememberMe = function(forceUpdate = false) {
    const input = document.getElementById('rememberMeInput');
    const icon = document.getElementById('rememberIcon');
    const box = document.getElementById('rememberBox');
    
    if(!input || !icon || !box) return;

    if(!forceUpdate) input.checked = !input.checked;
    
    if(input.checked) {
        icon.classList.remove('hidden');
        box.classList.add('bg-neon-blue/10');
        box.classList.add('border-neon-blue');
    } else {
        icon.classList.add('hidden');
        box.classList.remove('bg-neon-blue/10');
        box.classList.remove('border-neon-blue');
    }
};

// ===========================================================
// NAVIGATION & STORE
// ===========================================================

window.launchGame = function(page) {
    if (!firebase.auth().currentUser) {
        window.showToast("ACCESS DENIED: Identification Required", "error");
        window.openAuthModal();
        return;
    }
    window.location.href = page;
};

window.openUpgradeModal = function() {
    const modal = document.getElementById('upgradeModal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
};

window.closeUpgradeModal = function() {
    const modal = document.getElementById('upgradeModal');
    if(modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};
