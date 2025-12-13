console.log("[1] Index.js initializing...");

document.addEventListener("DOMContentLoaded", function() {
    console.log("[2] DOM Content Loaded");
    
    const db = firebase.firestore();

    // -------------------------------------------------------------
    // 1. HANDLE REDIRECT RESULT (Must come before Auth State)
    // -------------------------------------------------------------
    firebase.auth().getRedirectResult()
        .then((result) => {
            console.log("[3] Checking Redirect Result...");
            if (result.user) {
                console.log("✅ [SUCCESS] Redirect Login CAUGHT! User:", result.user.uid);
                window.showToast("Login Successful!", "success");
            } else {
                console.log("ℹ️ [INFO] No redirect data found (Normal page load).");
            }
        })
        .catch((error) => {
            console.error("❌ [ERROR] Redirect Failed:", error.code, error.message);
            window.showToast("Login Failed: " + error.message, "error");
        });

    // -------------------------------------------------------------
    // 2. AUTH STATE MONITOR
    // -------------------------------------------------------------
    firebase.auth().onAuthStateChanged(async (user) => {
        console.log("[4] Auth State Changed Event Fired");
        
        // UI Elements
        const loginBtn = document.getElementById('loginBtn');
        const userInfo = document.getElementById('userInfo');
        const userNameEl = document.getElementById('userName');
        const userCoinsEl = document.getElementById('userCoins');

        if (user) {
            // >>> USER IS LOGGED IN <<<
            console.log("✅ [STATE] User Session Active:", user.uid);

            // Update UI
            if(loginBtn) loginBtn.classList.add('hidden');
            if(userInfo) {
                userInfo.classList.remove('hidden');
                userInfo.classList.add('flex');
            }
            if(userNameEl) userNameEl.innerText = (user.displayName || "AGENT").toUpperCase();

            // Close Modal
            closeAuthModal();

            // Database Sync
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
            console.log("🚫 [STATE] No active session (Guest or User).");

            // Reset UI
            if(userInfo) {
                userInfo.classList.add('hidden');
                userInfo.classList.remove('flex');
            }
            if(loginBtn) loginBtn.classList.remove('hidden');

            // Only open modal if we are NOT in the middle of a redirect check
            // (We rely on the user clicking login to open it, to be less annoying)
            // window.openAuthModal(); 
        }
    });
});

// ===========================================================
// GLOBAL FUNCTIONS
// ===========================================================

window.loginGoogle = function() {
    console.log("🚀 Starting Google Login (Redirect Mode)...");
    saveRememberMePref();
    
    // Force Local Persistence so the browser remembers across the reload
    firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => {
            const provider = new firebase.auth.GoogleAuthProvider();
            return firebase.auth().signInWithRedirect(provider);
        })
        .catch((error) => {
            console.error("Login Init Error:", error);
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

// HELPERS
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
