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
     * 1. ADD REWARD
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
     * 2. VISUAL LEVEL UP MODAL
     * A flashy cyberpunk overlay when leveling up.
     */
    showLevelUpModal(newLevel, bonusCoins) {
        // Create HTML if it doesn't exist
        if (!document.getElementById('levelUpModal')) {
            const modal = document.createElement('div');
            modal.id = 'levelUpModal';
            modal.innerHTML = `
                <div style="
                    position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 99999;
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    font-family: 'Orbitron', sans-serif; text-align: center;
                ">
                    <h1 style="color: #ff003c; font-size: 3rem; text-shadow: 0 0 20px red; margin: 0;">SYSTEM UPGRADE</h1>
                    <div style="font-size: 6rem; color: #fff; font-weight: bold; margin: 20px 0;">${newLevel}</div>
                    <p style="color: #00f3ff; font-size: 1.2rem; letter-spacing: 2px;">ACCESS LEVEL INCREASED</p>
                    <div style="margin-top: 20px; color: #ffd700;">BONUS: +${bonusCoins} CR</div>
                    <button onclick="document.getElementById('levelUpModal').remove()" style="
                        margin-top: 40px; padding: 15px 40px; background: transparent; 
                        border: 2px solid #00f3ff; color: #00f3ff; font-family: 'Orbitron'; 
                        cursor: pointer; font-size: 1.2rem; transition: 0.3s;
                    ">ACKNOWLEDGE</button>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Play Sound
            // const audio = new Audio('sounds/levelup.mp3'); audio.play();
        }
    }
};
