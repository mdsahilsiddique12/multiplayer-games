console.log("[1] Index.js LOADED");

// ===========================================================
// 1. IMMEDIATE REDIRECT CHECK (Run this ASAP)
// ===========================================================
if (firebase.auth()) {
    console.log("[2] Firebase Auth Detected - Checking Redirect...");
    
    firebase.auth().getRedirectResult()
        .then((result) => {
            if (result.user) {
                console.log("🎉 [SUCCESS] Redirect Login Verified:", result.user.uid);
                window.showToast("Login Successful!", "success");
                // The onAuthStateChanged listener below will handle the UI update
            } else {
                console.log("ℹ️ [INFO] Page loaded, but no redirect data found.");
            }
        })
        .catch((error) => {
            console.error("❌ [CRITICAL] Redirect Failed:", error);
            window.showToast("Login Error: " + error.message, "error");
        });
}

// ===========================================================
// 2. MAIN LOGIC (Wait for page load)
// ===========================================================
document.addEventListener("DOMContentLoaded", function() {
    console.log("[3] DOM Ready");
    const db = firebase.firestore();

    // AUTH STATE LISTENER
    firebase.auth().onAuthStateChanged(async (user) => {
        const loginBtn = document.getElementById('loginBtn');
        const userInfo = document.getElementById('userInfo');
        const userNameEl = document.getElementById('userName');
        const userCoinsEl = document.getElementById('userCoins');

        if (user) {
            console.log("✅ [STATE] User is Logged In:", user.uid);

            // 1. UI Updates
            if(loginBtn) loginBtn.classList.add('hidden');
            if(userInfo) {
                userInfo.classList.remove('hidden');
                userInfo.classList.add('flex');
            }
            if(userNameEl) userNameEl.innerText = (user.displayName || "AGENT").toUpperCase();

            // 2. Close Modal
            closeAuthModal();

            // 3. Sync User Profile
            const userRef = db.collection('users').doc(user.uid);
            try {
                let doc = await userRef.get();
                if (!doc.exists) {
                    // Create new profile
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
            console.log("🚫 [STATE] User is Logged Out");

            // Reset UI
            if(userInfo) {
                userInfo.classList.add('hidden');
                userInfo.classList.remove('flex');
            }
            if(loginBtn) loginBtn.classList.remove('hidden');
            
            // Open Modal
            window.openAuthModal();
        }
    });
});

// ===========================================================
// 3. SIMPLIFIED LOGIN FUNCTION
// ===========================================================
window.loginGoogle = function() {
    console.log("🚀 Initiating Google Redirect...");
    
    // Save preference
    const checkbox = document.getElementById('rememberMeInput');
    if(checkbox && checkbox.checked) localStorage.setItem('gn_remember', 'true');
    else localStorage.removeItem('gn_remember');

    const provider = new firebase.auth.GoogleAuthProvider();

    // DIRECT REDIRECT (No complex promise chains)
    firebase.auth().signInWithRedirect(provider);
};

// ===========================================================
// 4. OTHER FUNCTIONS
// ===========================================================
window.loginGuest = function() {
    const user = firebase.auth().currentUser;
    if (user) {
        window.showToast("Already logged in.", "info");
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

// UI Helpers
window.openAuthModal = function() {
    const modal = document.getElementById('authModal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        // Checkbox logic
        const savedPref = localStorage.getItem('gn_remember') === 'true';
        const checkbox = document.getElementById('rememberMeInput');
        if(checkbox) {
            checkbox.checked = savedPref;
            window.toggleRememberMe(true);
        }
    }
};

window.closeAuthModal = function() { // Added window. prefix to be safe
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
