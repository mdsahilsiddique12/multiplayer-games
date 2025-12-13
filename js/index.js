console.log("Index.js initializing...");

document.addEventListener("DOMContentLoaded", function() {
    
    const db = firebase.firestore();

    // -------------------------------------------------------------
    // 1. HANDLE REDIRECT RESULT (The "Catch" Logic)
    // -------------------------------------------------------------
    // This looks for a user RETURNING from Google
    firebase.auth().getRedirectResult()
        .then((result) => {
            if (result.user) {
                console.log("✅ Redirect Login CAUGHT! User:", result.user.uid);
                // The onAuthStateChanged will handle the UI updates automatically
            } else {
                console.log("ℹ️ Page loaded normally (no redirect return detected).");
            }
        })
        .catch((error) => {
            console.error("❌ Redirect Error:", error.code, error.message);
            if (error.code === 'auth/unauthorized-domain') {
                window.showToast("CRITICAL: Domain not authorized in Firebase Console!", "error");
            } else {
                window.showToast("Login Failed: " + error.message, "error");
            }
        });

    // -------------------------------------------------------------
    // 2. AUTH STATE MONITOR (The Core Logic)
    // -------------------------------------------------------------
    firebase.auth().onAuthStateChanged(async (user) => {
        
        // UI Elements
        const loginBtn = document.getElementById('loginBtn');
        const userInfo = document.getElementById('userInfo');
        const userNameEl = document.getElementById('userName');
        const userCoinsEl = document.getElementById('userCoins');

        if (user) {
            // >>> USER IS LOGGED IN <<<
            console.log("✅ User Session Active:", user.uid);

            // 1. Update UI
            if(loginBtn) loginBtn.classList.add('hidden');
            if(userInfo) {
                userInfo.classList.remove('hidden');
                userInfo.classList.add('flex');
            }
            if(userNameEl) userNameEl.innerText = (user.displayName || "AGENT").toUpperCase();

            // 2. Close Modal
            closeAuthModal();

            // 3. Database Sync (Create Profile if New)
            const userRef = db.collection('users').doc(user.uid);
            try {
                let doc = await userRef.get();
                if (!doc.exists) {
                    await userRef.set({
                        username: user.displayName || "Agent",
                        email: user.email || "guest",
                        coins: 100,
                        xp: 0,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
                const data = (await userRef.get()).data();
                if(userCoinsEl) userCoinsEl.innerText = (data.coins || 0) + " CR";
            } catch (e) { console.error("DB Error:", e); }

        } else {
            // >>> USER IS LOGGED OUT <<<
            console.log("🚫 No active session.");

            // Reset UI
            if(userInfo) {
                userInfo.classList.add('hidden');
                userInfo.classList.remove('flex');
            }
            if(loginBtn) loginBtn.classList.remove('hidden');

            // Open Login Modal automatically
            window.openAuthModal();
        }
    });
});

// ===========================================================
// GLOBAL FUNCTIONS
// ===========================================================

/**
 * GOOGLE LOGIN (PERSISTENCE FIX)
 * Forces the browser to remember the login attempt across reloads.
 */
window.loginGoogle = function() {
    saveRememberMePref();
    
    // >>> THE FIX: FORCE LOCAL PERSISTENCE <<<
    firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => {
            const provider = new firebase.auth.GoogleAuthProvider();
            // Use Redirect
            return firebase.auth().signInWithRedirect(provider);
        })
        .catch((error) => {
            console.error("Login Error:", error);
            window.showToast("System Error: " + error.message, "error");
        });
};

window.loginGuest = function() {
    saveRememberMePref();
    const user = firebase.auth().currentUser;
    if (user) {
        window.showToast("Session already active.", "info");
        closeAuthModal();
    } else {
        firebase.auth().signInAnonymously()
            .catch(error => window.showToast("Guest Error: " + error.message, "error"));
    }
};

window.logoutUser = function() {
    if(confirm("Disconnect?")) {
        localStorage.removeItem('gn_remember');
        firebase.auth().signOut().then(() => window.location.reload());
    }
};

// --- HELPER: Save Checkbox State ---
function saveRememberMePref() {
    const checkbox = document.getElementById('rememberMeInput');
    if(checkbox && checkbox.checked) localStorage.setItem('gn_remember', 'true');
    else localStorage.removeItem('gn_remember');
}

// UI HANDLERS
window.openAuthModal = function() {
    const modal = document.getElementById('authModal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        // Restore Checkbox
        const savedPref = localStorage.getItem('gn_remember') === 'true';
        const checkbox = document.getElementById('rememberMeInput');
        if(checkbox) {
            checkbox.checked = savedPref;
            window.toggleRememberMe(true); 
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
    if(!input) return;

    if(!forceUpdate) input.checked = !input.checked;
    
    if(input.checked) {
        icon.classList.remove('hidden');
        box.classList.add('bg-neon-blue/10');
    } else {
        icon.classList.add('hidden');
        box.classList.remove('bg-neon-blue/10');
    }
};

window.launchGame = function(page) {
    if (!firebase.auth().currentUser) {
        window.showToast("ACCESS DENIED", "error");
        window.openAuthModal();
        return;
    }
    window.location.href = page;
};
// Add openUpgradeModal/closeUpgradeModal as needed
