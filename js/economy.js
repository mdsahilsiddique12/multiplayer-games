const Economy = {
    // Configuration
    XP_TO_LEVEL_1: 500,     // XP needed for level 1-2
    XP_SCALING: 1.2,        // Each level requires 20% more XP
    
    // Rewards Table
    REWARDS: {
        LOGIN_DAILY: { coins: 50, xp: 25 },
        GAME_WIN: { coins: 100, xp: 150 },
        GAME_LOSS: { coins: 20, xp: 50 },
        KILL_DETECTIVE: { coins: 10, xp: 20 }, // Per kill
        CORRECT_GUESS: { coins: 30, xp: 40 }   // Raja Mantri guess
    },

    /**
     * 1. ADD REWARD (Flat)
     * Adds coins/xp, updates DB, checks for level up.
     * @param {string} reason - Key from REWARDS table (e.g., 'GAME_WIN')
     */
    async award(reason) {
        const user = firebase.auth().currentUser;
        if (!user) return;

        const reward = this.REWARDS[reason];
        if (!reward) return console.error("Invalid Reward Reason:", reason);

        const db = firebase.firestore();
        const userRef = db.collection('users').doc(user.uid);

        try {
            // Transaction ensures data integrity (no glitching coins)
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(userRef);
                if (!doc.exists) return;

                const data = doc.data();
                let newCoins = (data.coins || 0) + reward.coins;
                let newXP = (data.xp || 0) + reward.xp;
                let currentLevel = data.level || 1;
                let didLevelUp = false;

                // CHECK LEVEL UP
                // Formula: Threshold = 500 * (1.2 ^ (Level - 1))
                let xpThreshold = Math.floor(Economy.XP_TO_LEVEL_1 * Math.pow(Economy.XP_SCALING, currentLevel - 1));

                if (newXP >= xpThreshold) {
                    currentLevel++;
                    newXP = newXP - xpThreshold; // Rollover XP
                    didLevelUp = true;
                }

                // Commit to DB
                transaction.update(userRef, {
                    coins: newCoins,
                    xp: newXP,
                    level: currentLevel
                });

                // UI Feedback
                window.showToast(`+${reward.coins} CR | +${reward.xp} XP`, "success");
                
                if (didLevelUp) {
                    Economy.showLevelUpModal(currentLevel, reward.coins * 2); // Bonus coins for leveling up
                }
            });
        } catch (e) {
            console.error("Economy Error:", e);
        }
    },

    /**
     * 3. RANKED REWARD SYSTEM (NEW)
     * Calculates reward based on position (1st, 2nd, etc.)
     * @param {number} rank - 1 is highest
     * @param {number} totalPlayers - Total players in the lobby
     */
    async awardRanked(rank, totalPlayers) {
        // Define Base Pools (The pot of gold)
        const MAX_COINS = 250; 
        const MAX_XP = 600;

        // Deterioration Formula:
        // Rank 1 gets 100%, Rank 2 gets 60%, Rank 3 gets 30%...
        let multiplier = 1.0;
        
        if (rank === 1) multiplier = 1.0;       // 1st Place
        else if (rank === 2) multiplier = 0.6;  // 2nd Place
        else if (rank === 3) multiplier = 0.3;  // 3rd Place
        else multiplier = 0.1;                  // Participation

        // Calculate actual amount
        const coinsEarned = Math.floor(MAX_COINS * multiplier);
        const xpEarned = Math.floor(MAX_XP * multiplier);

        // Send to Database
        const user = firebase.auth().currentUser;
        if (!user) return;

        const db = firebase.firestore();
        const userRef = db.collection('users').doc(user.uid);

        try {
            await db.runTransaction(async (t) => {
                const doc = await t.get(userRef);
                if (!doc.exists) return;
                
                const data = doc.data();
                const newCoins = (data.coins || 0) + coinsEarned;
                const newXP = (data.xp || 0) + xpEarned;
                
                // Handle Leveling (Reusing logic)
                let currentLevel = data.level || 1;
                let xpThreshold = Math.floor(Economy.XP_TO_LEVEL_1 * Math.pow(Economy.XP_SCALING, currentLevel - 1));
                if (newXP >= xpThreshold) {
                    currentLevel++;
                    newXP = newXP - xpThreshold;
                    window.showLevelUp(currentLevel, coinsEarned);
                }

                t.update(userRef, { coins: newCoins, xp: newXP, level: currentLevel });
                
                // Show Rank Toast
                setTimeout(() => {
                    const rankSuffix = (rank === 1) ? "st" : (rank === 2) ? "nd" : (rank === 3) ? "rd" : "th";
                    window.showToast(`RANK ${rank}${rankSuffix}: +${coinsEarned} CR | +${xpEarned} XP`, rank === 1 ? "success" : "info");
                }, 1000 * rank); // Stagger toasts so they don't overlap if testing locally
            });
        } catch (e) { console.error("Rank Reward Error:", e); }
    },

    /**
     * 2. VISUAL LEVEL UP MODAL
     * A flashy cyberpunk overlay when leveling up.
     */
   
