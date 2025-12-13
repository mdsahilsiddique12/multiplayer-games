// --- js/firebase-config.js ---
// ONLY INITIALIZATION CODE. NO LISTENERS HERE.

const firebaseConfig = {
    apiKey: "AIzaSyBs8Og7h-YLS3GsrYxDmWYl-468x53N8Fw",
    authDomain: "my-game-1a8b5.firebaseapp.com",
    projectId: "my-game-1a8b5",
    storageBucket: "my-game-1a8b5.firebasestorage.app", // Fixed domain (was .app)
    messagingSenderId: "835310690681",
    appId: "1:835310690681:web:01131eb278ee63682d4fa8",
    measurementId: "G-SPMYSY2T5K"
};

// Initialize only if not already initialized
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase Core Initialized");
}
