console.log("[1] Index.js LOADED");

document.addEventListener("DOMContentLoaded", function() {
    console.log("[2] DOM Ready");
    
    // Initialize Firestore
    const db = firebase.firestore();

    // -------------------------------------------------------------
    // AUTH STATE MONITOR (Handles UI updates automatically)
    // -------------------------------------------------------------
    firebase.auth().onAuthStateChanged(async (user) => {
        
        // UI Elements
        const loginBtn = document.getElementById('loginBtn');
        const userInfo = document.getElementById('userInfo');
        const userNameEl = document.getElementById('userName');
        const userCoinsEl = document.getElementById('userCoins');

        if (user) {
            // >>> USER IS LOGGED IN <<<
            console.log("✅ [STATE] User Session Active:", user.uid);

            // 1. Update UI
            if(loginBtn) loginBtn.classList.add('hidden');
            if(userInfo) {
                userInfo.classList.remove('hidden');
                userInfo.classList.add('flex');
            }
            if(userNameEl) userNameEl.innerText = (user.displayName || "AGENT").toUpperCase();

            // 2. Close Modal
            closeAuthModal();

            // 3. Database Sync
            // Database Sync & Daily Reward Logic
            const userRef = db.collection('users').doc(user.uid);
            try {
                let doc = await userRef.get();
                
                // 1. Create Profile if it doesn't exist
                if (!doc.exists) {
                    await userRef.set({
                        username: user.displayName || "Agent",
                        email: user.email || "guest",
                        coins: 100,
                        xp: 0,
                        level: 1,
                        lastLoginDate: null, // New field for tracking
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    doc = await userRef.get();
                }

                // 2. CHECK DAILY REWARD
                const data = doc.data();
                const today = new Date().toDateString(); // e.g., "Mon Dec 14 2025"
                const lastLogin = data.lastLoginDate;

                if (lastLogin !== today) {
                    // It's a new day! Give reward.
                    console.log("🎁 Awarding Daily Login Bonus...");
                    Economy.award('LOGIN_DAILY');
                    
                    // Update the date so they can't claim again today
                    await userRef.update({ lastLoginDate: today });
                }

                // 3. Update UI
                if(userCoinsEl) userCoinsEl.innerText = (data.coins || 0) + " CR";
                
            } catch (e) { console.error("DB Error:", e); }

        } else {
            // >>> USER IS LOGGED OUT <<<
            console.log("🚫 [STATE] User is Logged Out");

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
 * GOOGLE LOGIN (POPUP MODE)
 * This is the version that was confirmed to work.
 */
window.loginGoogle = function() {
    console.log("🚀 Starting Google Login (Popup Mode)...");
    saveRememberMePref();
    
    const provider = new firebase.auth.GoogleAuthProvider();

    // Use signInWithPopup because Redirect was being blocked by browser privacy
    firebase.auth().signInWithPopup(provider)
        .then((result) => {
            console.log("Login Success");
            window.showToast("Login Successful!", "success");
            // onAuthStateChanged will handle the rest
        })
        .catch((error) => {
            console.error("Login Error:", error);
            // Ignore the Cross-Origin noise, only show real errors
            if (error.code !== 'auth/popup-closed-by-user') {
                window.showToast("Login Error: " + error.message, "error");
            }
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

// ===========================================================
// HELPERS & MODALS
// ===========================================================

function saveRememberMePref() {
    const checkbox = document.getElementById('rememberMeInput');
    if(checkbox && checkbox.checked) localStorage.setItem('gn_remember', 'true');
    else localStorage.removeItem('gn_remember');
}

window.openAuthModal = function() {
    const modal = document.getElementById('authModal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        const savedPref = localStorage.getItem('gn_remember') === 'true';
        const checkbox = document.getElementById('rememberMeInput');
        if(checkbox) {
            checkbox.checked = savedPref;
            window.toggleRememberMe(true); 
        }
    }
};

window.closeAuthModal = function() {
    const modal = document.getElementById('authModal');
    if(modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

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

// UPGRADE MODAL HANDLERS
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
