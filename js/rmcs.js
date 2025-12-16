document.addEventListener("DOMContentLoaded", function () {
  // ============================================================================
  // --- 1. CORE INITIALIZATION ---
  // ============================================================================
  if (typeof firebase === "undefined") {
    console.error("Firebase SDK missing");
    return;
  }
  const db = firebase.firestore();
  let unsubscribe = null;
  let unsubscribeLobbyList = null;
  
  // Game State
  let roomId = "";
  let currentUserData = null;
  let lastPhase = "";
  let lastPendingJoins = []; // For host UI tracking
  
  // Constants
  const MIN_PLAYERS = 4;
  const MAX_PLAYERS = 8;
  
  // Chat Configuration
  const CHAT_HISTORY_LIMIT = 150;
  const CHAT_FREE_LIMIT = 80;
  const CHAT_VIP_LIMIT = 220;
  const CHAT_MAX_MESSAGE_LENGTH = 240;
  const CHAT_SECRET = "rmcs_v1_chat_key";

  // ============================================================================
  // --- 2. DOM ELEMENTS & BINDINGS ---
  // ============================================================================
  const getEl = (id) => document.getElementById(id);
  
  // Screens
  const mainMenu = getEl("mainMenu");
  const createScreen = getEl("createScreen");
  const joinScreen = getEl("joinScreen");
  const gameScreen = getEl("gameScreen");
  const storeScreen = getEl("storeScreen");
  
  // Game UI
  const gameContent = getEl("gameContent");
  const playersListEl = getEl("playersList");
  const currentRoomCode = getEl("currentRoomCode");
  const scoreListEl = getEl("scoreList");
  const roomPlayerCountEl = getEl("roomPlayerCount");
  const roomMaxPlayersEl = getEl("roomMaxPlayers");
  const roomMinPlayersEl = getEl("roomMinPlayers");
  const roundTransition = getEl("roundTransition");
  
  // Buttons & Inputs
  const startGameBtn = getEl("startGameBtn");
  const cancelRoomBtn = getEl("cancelRoomBtn");
  const copyCodeBtn = getEl("copyCodeBtn");
  const copyLinkBtn = getEl("copyLinkBtn");
  const openStoreBtn = getEl("openStoreBtn");
  const openHistoryBtn = getEl("openHistoryBtn");
  const exitLobbyBtn = getEl("exitLobbyBtn");
  
  // Lobby / Store Lists
  const publicLobbiesList = getEl("publicLobbiesList");
  const storeGrid = getEl("storeGrid");
  const userCoinsEl = getEl("userCoins");

  // Private Room Inputs
  const roomVisibilitySelect = getEl("roomVisibility");
  const waitingRoomToggle = getEl("waitingRoomToggle");
  const requireApprovalCheckbox = getEl("requireApprovalCheckbox");
  const joinRequestsPanel = getEl("joinRequestsPanel");

  // Chat Elements
  const chatLogEl = getEl("chatLog");
  const chatInputEl = getEl("chatInput");
  const chatSendBtnEl = getEl("chatSendBtn");
  const chatQuotaEl = getEl("chatQuota");

  // Set static text
  if (roomMaxPlayersEl) roomMaxPlayersEl.textContent = MAX_PLAYERS;
  if (roomMinPlayersEl) roomMinPlayersEl.textContent = MIN_PLAYERS;

  // Cleanup hook
  let postFeedbackAction = null;

  // ============================================================================
  // --- 3. HELPER FUNCTIONS (SOUND, CRYPTO, STYLES) ---
  // ============================================================================

  // Name Styles
  const NAME_STYLES = {
    host: `color:#FFD700; border:1px solid #FFD700; text-shadow:0 0 12px rgba(255,215,0,0.8); font-weight:bold;`,
    vip: `background:linear-gradient(90deg,#00E4FF,#FF00FF); -webkit-background-clip:text; color:transparent; border:1px solid rgba(255,0,255,0.4); text-shadow:0 0 10px rgba(0,255,255,0.5);`,
    normal: `color:#4EF3FF; border:1px solid #4EF3FF; text-shadow:0 0 6px rgba(78,243,255,0.5);`
  };

  function getNameStyleForPlayer(p, hostId) {
    const isHost = p.id === hostId;
    const isVip = !!p.isVip || (p.inventory && p.inventory.includes("vip_pass"));
    const roleType = p.roleType || (isHost ? "host" : isVip ? "vip" : "normal");
    return NAME_STYLES[roleType] || NAME_STYLES.normal;
  }

  // Chat Encryption
  function encryptChatText(plain) {
    try {
      const key = CHAT_SECRET;
      let out = "";
      for (let i = 0; i < plain.length; i++) {
        const c = plain.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        out += String.fromCharCode(c);
      }
      return btoa(out);
    } catch (e) { return ""; }
  }

  function decryptChatText(encB64) {
    try {
      const key = CHAT_SECRET;
      const data = atob(encB64 || "");
      let out = "";
      for (let i = 0; i < data.length; i++) {
        const c = data.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        out += String.fromCharCode(c);
      }
      return out;
    } catch (e) { return "[corrupted]"; }
  }

  // Sound Engine
  const SoundEffects = {
    meme: {
      caught: new Audio("sounds/sabash.mp3"),
      escaped: new Audio("sounds/failure.mp3"),
      reveal: new Audio("sounds/drum_roll.mp3"),
      click: new Audio("sounds/bubble.mp3"),
      cash: new Audio("sounds/cash.mp3")
    },
    default: {
      caught: new Audio("sounds/sabash.mp3"),
      escaped: new Audio("sounds/anyay.mp3"),
      reveal: new Audio("sounds/vine-boom.mp3"),
      click: new Audio("sounds/bubble.mp3"),
      cash: new Audio("sounds/ca.mp3")
    }
  };

  function playSound(type) {
    const hasMemePack = currentUserData && currentUserData.inventory && currentUserData.inventory.includes("meme_pack");
    const pack = hasMemePack ? "meme" : "default";
    const audio = SoundEffects[pack][type];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
  }

  // Terminal Logger
  function pushTerminalMessage(message, tone = "system") {
    const box = document.getElementById("terminalLog");
    if (!box) return;
    const now = new Date();
    const stamp = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    let colorClass = "text-neon-blue";
    if (tone === "hint") colorClass = "text-cyan-300";
    if (tone === "warning") colorClass = "text-red-400";
    if (tone === "success") colorClass = "text-neon-green";
    
    const line = document.createElement("div");
    line.className = "border border-gray-800 rounded px-2 py-1 bg-black/40 animate-fade-in";
    line.innerHTML = `<span class="text-gray-500 mr-1">[${stamp}]</span><span class="${colorClass} font-bold">GM:</span><span class="text-gray-300 ml-1 font-mono text-xs">${message}</span>`;
    
    box.prepend(line);
    while (box.children.length > 25) { box.removeChild(box.lastChild); }
  }

  // ============================================================================
  // --- 4. AUTH & USER DATA (ECONOMY SYNC) ---
  // ============================================================================
  firebase.auth().onAuthStateChanged(async (user) => {
    if (user) { await loadUserData(user.uid); }
  });

  async function loadUserData(uid) {
    const userRef = db.collection("users").doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) {
      const initialData = {
        username: "Agent_" + uid.substring(0, 4),
        coins: 100, xp: 0, seasonXp: 0, inventory: [], level: 1,
        joinedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await userRef.set(initialData);
      currentUserData = initialData;
    } else {
      currentUserData = snap.data();
      if (typeof currentUserData.coins !== "number") currentUserData.coins = 0;
      if (typeof currentUserData.xp !== "number") currentUserData.xp = 0;
    }
    refreshUserCoinsUI();
  }

  async function requireAuth() {
    const user = firebase.auth().currentUser;
    if (!user) throw new Error("Auth Required");
    return user.uid;
  }

  function refreshUserCoinsUI() {
    if (userCoinsEl && currentUserData) {
      userCoinsEl.textContent = currentUserData.coins ?? 0;
    }
  }

  // ============================================================================
  // --- 5. STORE & INVENTORY ---
  // ============================================================================
  const STORE_ITEMS = [
    { id: "robot_avatar", name: "Robot Avatar", type: "avatars", price: 200, requiresVip: false, emoji: "🤖", desc: "Synthetic operative shell." },
    { id: "alien_avatar", name: "Alien Avatar", type: "avatars", price: 250, requiresVip: true, emoji: "👽", desc: "Classified identity." },
    { id: "gold_name", name: "Gold Nameplate", type: "colors", price: 300, requiresVip: true, emoji: "🏅", desc: "High-value asset." },
    { id: "cyan_name", name: "Neon Cyan Tag", type: "colors", price: 120, requiresVip: false, emoji: "💠", desc: "Clean cyber aesthetic." },
    { id: "meme_pack", name: "Meme Sound Pack", type: "sounds", price: 180, requiresVip: false, emoji: "😂", desc: "Funny SFX pack." },
    { id: "vip_pass", name: "VIP Protocol Access", type: "colors", price: 500, requiresVip: false, emoji: "⭐", desc: "Unlock VIP skins." }
  ];

  function ownsItem(id) {
    return (currentUserData && Array.isArray(currentUserData.inventory) && currentUserData.inventory.includes(id));
  }
  function userHasVip() { return ownsItem("vip_pass"); }

  function renderStore(category = "avatars") {
    if (!storeGrid) return;
    if (!currentUserData) refreshUserCoinsUI();
    const filtered = STORE_ITEMS.filter((item) => item.type === category);
    
    if (filtered.length === 0) {
      storeGrid.innerHTML = '<div class="text-sm text-gray-400 font-mono">No items in this category yet.</div>';
      return;
    }

    storeGrid.innerHTML = filtered.map((item) => {
        const owned = ownsItem(item.id);
        const needsVip = item.requiresVip && !userHasVip();
        const canAfford = currentUserData.coins >= item.price;
        
        let actionBtn = "";
        if (owned) actionBtn = '<span class="text-[10px] text-neon-green uppercase tracking-[0.2em]">OWNED</span>';
        else if (needsVip) actionBtn = '<span class="text-[10px] text-red-400 uppercase tracking-[0.2em]">NEED VIP</span>';
        else actionBtn = `<button class="px-2 py-1 text-[10px] uppercase tracking-[0.2em] border border-neon-blue rounded hover:bg-neon-blue/20 transition buy-item-btn" data-item-id="${item.id}">BUY</button>`;

        return `
          <div class="border border-gray-800 rounded-lg bg-black/50 p-3 flex flex-col justify-between text-xs font-mono transition hover:bg-black/70">
            <div>
              <div class="flex items-center justify-between mb-1">
                <span class="text-lg">${item.emoji}</span>
                ${item.requiresVip ? '<span class="text-[9px] text-yellow-400 uppercase tracking-[0.2em]">VIP</span>' : ""}
              </div>
              <div class="font-bold text-white mb-1">${item.name}</div>
              <div class="text-gray-400 text-[11px] mb-2">${item.desc}</div>
            </div>
            <div class="flex items-center justify-between mt-2 border-t border-gray-800 pt-2">
              <span class="text-yellow-400 text-[11px]">💰 ${item.price}</span>
              ${actionBtn}
            </div>
          </div>`;
      }).join("");

    storeGrid.querySelectorAll(".buy-item-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-item-id");
        const item = STORE_ITEMS.find((i) => i.id === id);
        if (item) purchaseItem(item);
      });
    });
  }

  async function purchaseItem(item) {
    if (!currentUserData) { window.showToast("Login required.", "error"); return; }
    if (currentUserData.coins < item.price) { window.showToast("Insufficient funds.", "error"); return; }
    
    window.setBtnLoading(null, true, "BUYING..."); // Global loader
    try {
      const uid = await requireAuth();
      const userRef = db.collection("users").doc(uid);
      await userRef.update({
        coins: firebase.firestore.FieldValue.increment(-item.price),
        inventory: firebase.firestore.FieldValue.arrayUnion(item.id)
      });
      // Local update
      currentUserData.coins -= item.price;
      if (!currentUserData.inventory) currentUserData.inventory = [];
      currentUserData.inventory.push(item.id);
      
      refreshUserCoinsUI();
      renderStore(item.type);
      playSound("cash");
      window.showToast(`Purchased ${item.name}`, "success");
    } catch (e) {
      console.error(e);
      window.showToast("Purchase failed.", "error");
    }
    window.setBtnLoading(null, false);
  }

  window.filterStore = function (category) {
    document.querySelectorAll(".store-tab").forEach((tab) => {
      if (tab.textContent.toLowerCase().includes(category.slice(0, 3))) {
        tab.classList.add("text-white", "border-b", "border-neon-blue");
        tab.classList.remove("text-gray-500");
      } else {
        tab.classList.remove("text-white", "border-b", "border-neon-blue");
        tab.classList.add("text-gray-500");
      }
    });
    renderStore(category);
  };

  // ============================================================================
  // --- 6. NAVIGATION & UI HELPERS ---
  // ============================================================================
  function showScreen(screen) {
    [mainMenu, createScreen, joinScreen, gameScreen, storeScreen].forEach((s) => {
      if (s) { s.classList.remove("active-screen"); s.style.display = "none"; }
    });
    if (screen) { 
        screen.style.display = "block"; 
        screen.classList.add("active-screen"); 
        // Animate in
        screen.style.opacity = 0;
        setTimeout(() => screen.style.opacity = 1, 10);
    }
  }

  document.querySelectorAll(".back-btn").forEach((b) => (b.onclick = () => showScreen(mainMenu)));
  if (openStoreBtn) openStoreBtn.onclick = () => { showScreen(storeScreen); refreshUserCoinsUI(); window.filterStore("avatars"); };
  
  if (copyCodeBtn) copyCodeBtn.onclick = () => {
      if (currentRoomCode.innerText) navigator.clipboard.writeText(currentRoomCode.innerText).then(() => window.showToast("Room code copied!", "success"));
  };
  
  if (exitLobbyBtn) {
    exitLobbyBtn.onclick = () => {
      window.confirmAction("ABORT MISSION?", "Are you sure you want to disconnect?", async () => {
        await leaveCurrentRoom();
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        postFeedbackAction = () => showScreen(mainMenu);
        showFeedbackModal("manual_disconnect");
      }, true); // danger = true
    };
  }

  // ============================================================================
  // --- 7. ROOM MANAGEMENT (CREATE/JOIN/LEAVE) ---
  // ============================================================================
  
  // Create Room
  if (getEl("createRoomFinal")) {
    getEl("createRoomFinal").onclick = async () => {
      const nameVal = getEl("createPlayerName").value.trim();
      const codeVal = getEl("createRoomCode").value.trim().toUpperCase() || Math.random().toString(36).substring(2, 6).toUpperCase();
      
      if (!nameVal) return window.showToast("Agent Name Required", "error");

      window.showLoading("INITIALIZING SERVER...");
      try {
        const uid = await requireAuth();
        const ref = db.collection("rmcs_rooms").doc(codeVal);
        const exists = (await ref.get()).exists;
        
        if (exists) { window.hideLoading(); return window.showToast("Frequency Occupied (Code Taken)", "error"); }

        const isVip = !!(currentUserData && currentUserData.inventory && currentUserData.inventory.includes("vip_pass"));
        const playerData = { id: uid, name: nameVal, inventory: currentUserData.inventory || [], isVip, nameColor: isVip ? "gold" : "white", roleType: "host" };

        // Private Room Logic
        const visibility = roomVisibilitySelect && roomVisibilitySelect.value === "personal" ? "personal" : "public";
        // Radio button fallback
        const radio = document.querySelector('input[name="roomVisibility"]:checked');
        const finalVis = radio ? radio.value : visibility;

        const waitingRoomEnabled = finalVis === "personal" && requireApprovalCheckbox && requireApprovalCheckbox.checked;

        await ref.set({
          host: uid,
          players: [playerData],
          phase: "lobby",
          scores: { [uid]: 0 },
          muted: [],
          history: [],
          created: firebase.firestore.FieldValue.serverTimestamp(),
          maxPlayers: MAX_PLAYERS,
          visibility: finalVis,
          waitingRoomEnabled: !!waitingRoomEnabled,
          pendingJoins: [],
          chat: [],
          chatMessageCounts: {}
        });

        roomId = codeVal;
        listenToRoom(roomId);
        showScreen(gameScreen);
      } catch (e) {
        console.error(e);
        window.showToast("Server Error: " + e.message, "error");
      } finally {
        window.hideLoading();
      }
    };
  }

  // Join Room
  if (getEl("joinRoomFinal")) {
    getEl("joinRoomFinal").onclick = async () => {
      const nameVal = getEl("joinPlayerName").value.trim();
      const codeVal = getEl("joinRoomCode").value.trim().toUpperCase();
      
      if (!nameVal || !codeVal) return window.showToast("Credentials Missing", "error");

      window.showLoading("CONNECTING...");
      try {
        const uid = await requireAuth();
        const ref = db.collection("rmcs_rooms").doc(codeVal);
        const snap = await ref.get();
        
        if (!snap.exists) { window.hideLoading(); return window.showToast("Signal Lost (Room Not Found)", "error"); }
        
        const data = snap.data();
        const isVip = !!(currentUserData && currentUserData.inventory && currentUserData.inventory.includes("vip_pass"));
        const roleType = uid === data.host ? "host" : isVip ? "vip" : "normal";
        const playerData = { id: uid, name: nameVal, inventory: currentUserData.inventory || [], isVip, nameColor: isVip ? "gold" : "white", roleType };

        const players = data.players || [];
        const pending = data.pendingJoins || [];
        
        // Checks
        const alreadyPlayer = players.some(p => p.id === uid);
        const alreadyPending = pending.some(p => p.id === uid);

        if (!alreadyPlayer && players.length >= (data.maxPlayers || MAX_PLAYERS)) {
            window.hideLoading(); return window.showToast("Squad Full", "error");
        }

        // Logic: Direct Join vs Waiting Room
        if (!alreadyPlayer && !alreadyPending) {
            if (data.visibility === "public" && !data.waitingRoomEnabled) {
                // Public / Open -> Join Directly
                await ref.update({
                    players: firebase.firestore.FieldValue.arrayUnion(playerData),
                    [`scores.${uid}`]: 0
                });
            } else {
                // Private / Waiting Room -> Send Request
                await ref.update({
                    pendingJoins: firebase.firestore.FieldValue.arrayUnion({
                        ...playerData,
                        requestedAt: firebase.firestore.FieldValue.serverTimestamp()
                    })
                });
                window.hideLoading();
                window.showToast("Join request sent to host.", "info");
                // We still verify room connection by listening, but UI will show "Waiting"
            }
        }

        roomId = codeVal;
        listenToRoom(roomId);
        showScreen(gameScreen);
      } catch (e) {
        console.error(e);
        window.showToast("Connection Failed", "error");
      } finally {
        window.hideLoading();
      }
    };
  }

  // Leave Room
  async function leaveCurrentRoom() {
    if (!roomId) return;
    const user = firebase.auth().currentUser;
    if (!user) return;
    const uid = user.uid;
    const roomRef = db.collection("rmcs_rooms").doc(roomId);

    try {
      await db.runTransaction(async (t) => {
        const doc = await t.get(roomRef);
        if (!doc.exists) return;
        const data = doc.data();
        
        const newPlayers = (data.players || []).filter(p => p.id !== uid);
        const newPending = (data.pendingJoins || []).filter(p => p.id !== uid);
        const newScores = { ...data.scores };
        delete newScores[uid];

        if (uid === data.host) {
            if (newPlayers.length === 0) {
                t.delete(roomRef);
            } else {
                // Assign new host
                const nextHost = newPlayers[0];
                nextHost.roleType = "host"; // Update local role
                t.update(roomRef, {
                    host: nextHost.id,
                    players: newPlayers,
                    scores: newScores,
                    pendingJoins: newPending
                });
            }
        } else {
            t.update(roomRef, {
                players: newPlayers,
                scores: newScores,
                pendingJoins: newPending
            });
        }
      });
    } catch (e) { console.error("Leave failed", e); }
    roomId = "";
  }
  
  // Auto-leave on tab close
  window.addEventListener("beforeunload", () => leaveCurrentRoom());

  // ============================================================================
  // --- 8. GAME LOOP (REALTIME LISTENER) ---
  // ============================================================================
  function listenToRoom(roomCode) {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    
    const roomRef = db.collection("rmcs_rooms").doc(roomCode);
    
    unsubscribe = roomRef.onSnapshot((docSnap) => {
      const data = docSnap.data();
      const authUser = firebase.auth().currentUser;
      if (!authUser) return;
      const selfId = authUser.uid;

      // 1. Room Deleted / Kicked
      if (!data) {
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        postFeedbackAction = () => showScreen(mainMenu);
        pushTerminalMessage("Room terminated by host.", "warning");
        showFeedbackModal("room_closed");
        return;
      }

      // 2. Access Control
      const players = data.players || [];
      const pending = data.pendingJoins || [];
      lastPendingJoins = pending;
      
      const isInPlayers = players.some(p => p.id === selfId);
      const isPending = pending.some(p => p.id === selfId);
      const isHost = data.host === selfId;

      if (!isInPlayers && !isPending) {
        window.showToast("You are no longer in this room.", "error");
        showScreen(mainMenu);
        return;
      }

      // 3. UI Updates
      if (currentRoomCode) currentRoomCode.innerText = roomCode;
      if (roomPlayerCountEl) roomPlayerCountEl.textContent = players.length;

      // 4. Waiting Room Logic
      if (isPending && !isInPlayers) {
        if (gameContent) {
            gameContent.style.display = "flex";
            gameContent.innerHTML = `
                <div class="flex flex-col items-center animate-fade-in">
                    <div class="text-5xl mb-3 animate-pulse">⏳</div>
                    <h3 class="font-cyber text-neon-blue tracking-widest text-xl mb-2">ACCESS RESTRICTED</h3>
                    <p class="text-xs text-gray-400 font-mono">Awaiting Host Authorization...</p>
                </div>
            `;
        }
        return; // Stop rendering game
      }

      // 5. Host Controls (Join Requests)
      if (isHost) renderJoinRequestsPanel(pending, roomRef);
      else if (joinRequestsPanel) joinRequestsPanel.innerHTML = "";

      // 6. Host Abort Button
      if (cancelRoomBtn) {
        cancelRoomBtn.style.display = isHost ? "block" : "none";
        cancelRoomBtn.onclick = () => {
             if(!isHost) return;
             window.confirmAction("TERMINATE MISSION?", "This will kick all players.", async () => {
                 await roomRef.delete();
                 // Unsubscribe handles UI reset
             }, true);
        };
      }

      // 7. Chat
      renderChatLog(data.chat || [], selfId);

      // 8. Game Phase Logic
      lastPhase = data.phase;
      
      if (data.phase === "lobby") {
        if (gameContent) gameContent.style.display = "none";
        renderLobbyUI(players, selfId, data.host, data.scores, isHost, roomRef, data.muted);
      } else {
        if (gameContent) gameContent.style.display = "flex";
        renderGameUI(data, selfId, isHost, roomRef);
      }
      
      // Players List (Side)
      renderPlayersList(players, data.host, selfId, isHost, data.muted, roomRef);

    }, (error) => {
        console.error("Listener error:", error);
        window.showToast("Connection lost.", "error");
    });
  }

  // ============================================================================
  // --- 9. GAME LOGIC & SCORING (INTEGRATED WITH ECONOMY) ---
  // ============================================================================
  
  function renderLobbyUI(players, selfId, hostId, scores, isHost, roomRef, muted) {
    // 1. Avatars
    renderAvatarsTable(players, selfId);
    
    // 2. Scoreboard
    renderScoreboard(scores, players);
    
    // 3. Start Button
    if (startGameBtn) {
        startGameBtn.style.display = "flex";
        const canStart = isHost && players.length >= MIN_PLAYERS;
        startGameBtn.disabled = !canStart;
        startGameBtn.innerHTML = canStart 
            ? `INITIATE SEQUENCE <i class="fa-solid fa-play ml-2"></i>`
            : `WAITING FOR AGENTS (${players.length}/${MIN_PLAYERS})`;
        
        startGameBtn.onclick = () => {
            if (!canStart) return;
            // Distribute Roles
            const playerCount = players.length;
            let roles = ["Raja", "Mantri", "Sipahi", "Chor"];
            if (playerCount >= 5) roles.push("Rani");
            if (playerCount >= 6) roles.push("Praja");
            if (playerCount >= 7) roles.push("Jasoos");
            if (playerCount >= 8) roles.push("Vidushak");
            
            // Randomize
            roles = roles.slice(0, playerCount).sort(() => Math.random() - 0.5);
            
            const playerRoles = players.map((p, i) => ({
                id: p.id,
                name: p.name,
                role: roles[i]
            }));

            roomRef.update({
                phase: "reveal",
                playerRoles: playerRoles,
                revealed: [],
                guess: null,
                scoreUpdated: false
            });
            pushTerminalMessage("Mission sequence initiated.", "success");
        };
    }
  }

  function renderGameUI(data, selfId, isHost, roomRef) {
    // Hide start button
    if(startGameBtn) startGameBtn.style.display = "none";
    
    // Scoreboard remains visible
    renderScoreboard(data.scores || {}, data.players);

    if (data.phase === "reveal") {
        showRoleRevealScreen(data, selfId, roomRef);
    } else if (data.phase === "guess") {
        showSipahiGuessUI(data, selfId, roomRef);
    } else if (data.phase === "roundResult") {
        showRoundResult(data, selfId, roomRef, isHost);
    }
  }

  // --- ROLE REVEAL SCREEN ---
  function showRoleRevealScreen(data, selfId, roomRef) {
    const p = data.playerRoles.find(pr => pr.id === selfId);
    if (!p) return;

    const isRS = p.role === "Raja" || p.role === "Sipahi"; // Roles that need to reveal
    const amIRevealed = (data.revealed || []).some(r => r.id === selfId);
    
    // Check if both Raja & Sipahi revealed -> Move to Guess
    if (data.host === selfId) {
        const revealedRoles = (data.revealed || []).map(r => r.role);
        if (revealedRoles.includes("Raja") && revealedRoles.includes("Sipahi")) {
            roomRef.update({ phase: "guess", revealed: [] });
            return;
        }
    }

    gameContent.innerHTML = `
      <div class="flex flex-col items-center w-full animate-fade-in">
        <div class="text-6xl mb-4 drop-shadow-[0_0_15px_rgba(0,243,255,0.5)]">${getRoleIcon(p.role)}</div>
        <h3 class="font-cyber text-3xl text-neon-blue mb-2 tracking-[0.2em]">${p.role}</h3>
        <p class="text-gray-400 text-xs mb-6 font-mono uppercase">MISSION: ${getRoleDescription(p.role)}</p>
        
        ${isRS && !amIRevealed 
            ? `<button id="revealRoleBtn" class="cyber-btn danger text-sm w-full max-w-[200px]">EXPOSE IDENTITY</button>` 
            : !isRS 
            ? `<div class="border border-gray-700 text-gray-500 px-4 py-2 text-xs rounded uppercase tracking-widest">Status: Deep Cover</div>`
            : `<div class="text-neon-green text-sm font-bold animate-pulse uppercase border border-neon-green px-4 py-2 rounded">Identity Confirmed</div>`
        }

        <div class="mt-8 w-full border-t border-gray-800 pt-4">
          <p class="text-[10px] text-gray-500 uppercase mb-2 tracking-widest">Active Signals</p>
          <div class="flex justify-center gap-2 flex-wrap">
            ${(data.revealed || []).length 
                ? (data.revealed || []).map(r => `
                    <div class="bg-gray-900 border border-gray-700 px-3 py-1 rounded text-xs flex items-center gap-2">
                        <span class="text-neon-blue font-bold">${r.name}</span>
                        <span class="text-gray-500">is</span>
                        <span>${getRoleIcon(r.role)}</span>
                    </div>`).join("") 
                : '<span class="text-gray-700 italic text-xs">Waiting for signals...</span>'}
          </div>
        </div>
      </div>
    `;

    const btn = document.getElementById("revealRoleBtn");
    if (btn) btn.onclick = () => {
        playSound("reveal");
        roomRef.update({
            revealed: firebase.firestore.FieldValue.arrayUnion({ id: selfId, role: p.role, name: p.name })
        });
    };
  }

  // --- GUESS SCREEN ---
  function showSipahiGuessUI(data, selfId, roomRef) {
    const p = data.playerRoles.find(pr => pr.id === selfId);
    
    // If not Sipahi
    if (p.role !== "Sipahi") {
      gameContent.innerHTML = `
        <div class="text-center animate-fade-in">
          <div class="text-6xl mb-4 animate-bounce">🛡️</div>
          <h3 class="text-neon-blue font-bold text-xl tracking-widest mb-2">SIPAHI IS INVESTIGATING</h3>
          <p class="text-gray-500 text-xs font-mono">Maintain radio silence.</p>
        </div>
      `;
      return;
    }

    // If Sipahi
    const targets = data.playerRoles.filter(pr => pr.role !== "Raja" && pr.role !== "Sipahi" && pr.role !== "Rani"); // Usually Raja/Sipahi/Rani are safe
    // Note: In standard rules, Sipahi picks from remaining.
    
    gameContent.innerHTML = `
      <div class="flex flex-col items-center w-full max-w-sm animate-fade-in">
        <h3 class="font-cyber text-white mb-6 text-sm bg-red-900/20 border border-red-500/30 px-6 py-2 rounded uppercase tracking-widest animate-pulse">
          IDENTIFY THE CHOR
        </h3>
        <div class="grid grid-cols-1 gap-3 w-full">
          ${targets.map(t => `
            <button class="guess-btn cyber-btn w-full py-4 text-lg" data-id="${t.id}">
              ${t.name}
            </button>
          `).join("")}
        </div>
      </div>
    `;

    document.querySelectorAll(".guess-btn").forEach(btn => {
      btn.onclick = () => {
        const targetId = btn.dataset.id;
        const target = targets.find(t => t.id === targetId);
        
        roomRef.update({
            phase: "roundResult",
            guess: {
                sipahiId: p.id,
                guessedId: target.id,
                correct: target.role === "Chor",
                guessedName: target.name
            },
            scoreUpdated: false
        });
      };
    });
  }

  // --- RESULT SCREEN ---
  function showRoundResult(data, selfId, roomRef, isHost) {
    const res = data.guess;
    if (!res) return;
    const isCorrect = res.correct;

    // SFX
    if (!data.scoreUpdated) {
        playSound(isCorrect ? "caught" : "escaped");
    }

    // Host Calculations (Once)
    if (isHost && !data.scoreUpdated) {
        const pts = calculateRoundPoints(data.playerRoles, isCorrect, res.guessedId);
        
        // 1. Update Room Scores
        const newScores = { ...data.scores };
        Object.keys(pts).forEach(uid => {
            newScores[uid] = (newScores[uid] || 0) + pts[uid];
        });

        // 2. Add to History
        const historyEntry = {
            result: isCorrect ? "Caught" : "Escaped",
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            roles: data.playerRoles.map(p => ({
                id: p.id, name: p.name, role: p.role, points: pts[p.id] || 0
            }))
        };

        roomRef.update({
            scores: newScores,
            history: firebase.firestore.FieldValue.arrayUnion(historyEntry),
            scoreUpdated: true
        });

        // 3. Economy Integration (Centralized)
        processEconomyRewards(pts, isCorrect, data.playerRoles);
    }

    // UI
    const resultText = isCorrect ? "TARGET NEUTRALIZED" : "MISSION FAILED";
    const resultColor = isCorrect ? "text-neon-green" : "text-red-500";
    const emoji = isCorrect ? "🎯" : "🤡";

    // Map roles for display
    const roleMap = {};
    data.playerRoles.forEach(p => roleMap[p.role] = p.name);

    gameContent.innerHTML = `
      <div class="flex flex-col items-center w-full max-w-sm animate-fade-in">
        <div class="text-6xl mb-2">${emoji}</div>
        <h2 class="font-cyber text-2xl ${resultColor} mb-6 tracking-widest border-b border-gray-700 pb-2 w-full text-center">
          ${resultText}
        </h2>

        <div class="w-full text-sm space-y-2 font-mono text-left mb-6 bg-black/40 p-4 rounded border border-gray-800">
          ${Object.keys(roleMap).map(role => `
             <div class="flex justify-between items-center border-b border-gray-800/50 pb-1 last:border-0">
               <span class="text-gray-400 text-[10px] uppercase tracking-wider">${role}</span>
               <span class="text-white font-bold">${roleMap[role]}</span>
             </div>
          `).join("")}
        </div>

        ${isHost 
            ? `<button id="rebootBtn" class="cyber-btn w-full py-3 shadow-[0_0_20px_rgba(0,243,255,0.3)]">REBOOT SYSTEM</button>` 
            : `<div class="text-xs text-gray-500 animate-pulse">WAITING FOR HOST REBOOT...</div>`
        }
      </div>
    `;

    if (isHost) {
        const rbBtn = document.getElementById("rebootBtn");
        if(rbBtn) rbBtn.onclick = async () => {
            window.setBtnLoading("rebootBtn", true, "REBOOTING...");
            
            // Logic to restart (reshuffle logic same as start)
            // ... (Simplified: Reuse start button logic or just reset to lobby)
            // For better UX, let's reset to Lobby so people can leave/join
            // OR instant restart. Let's do instant restart for fluid gameplay.
            
            const playerCount = data.playerRoles.length;
            let roles = ["Raja", "Mantri", "Sipahi", "Chor"];
            if (playerCount >= 5) roles.push("Rani");
            if (playerCount >= 6) roles.push("Praja");
            if (playerCount >= 7) roles.push("Jasoos");
            if (playerCount >= 8) roles.push("Vidushak");
            roles = roles.slice(0, playerCount).sort(() => Math.random() - 0.5);
            
            const newRoles = data.playerRoles.map((p, i) => ({
                id: p.id, name: p.name, role: roles[i]
            }));

            await roomRef.update({
                phase: "reveal",
                playerRoles: newRoles,
                revealed: [],
                guess: null,
                scoreUpdated: false
            });
            window.setBtnLoading("rebootBtn", false);
        };
    }
  }

  // --- SCORING & ECONOMY HELPER ---
  function calculateRoundPoints(players, isCorrect, sipahiTargetId) {
    const playerCount = players.length;
    const multiplier = (playerCount >= 8) ? 2 : 1;
    
    // Points Config
    const P = {
        RAJA: 1000, RANI: 900, MANTRI: 800,
        SIPAHI_WIN: 500, SIPAHI_LOSS: 0,
        CHOR_WIN: 500, CHOR_LOSS: 0,
        PRAJA: 100, JASOOS: 300,
        VIDUSHAK_WIN: 1000, VIDUSHAK_LOSS: 0
    };

    let roundScores = {};

    players.forEach(p => {
        let s = 0;
        if (p.role === 'Raja') s = P.RAJA;
        else if (p.role === 'Rani') s = P.RANI;
        else if (p.role === 'Mantri') s = P.MANTRI;
        else if (p.role === 'Praja') s = P.PRAJA;
        else if (p.role === 'Jasoos') s = P.JASOOS;
        else if (p.role === 'Sipahi') s = isCorrect ? P.SIPAHI_WIN : P.SIPAHI_LOSS;
        else if (p.role === 'Chor') s = isCorrect ? P.CHOR_LOSS : P.CHOR_WIN;
        else if (p.role === 'Vidushak') {
            // Vidushak wins if they were the one accused by Sipahi (and Sipahi was wrong obviously)
            const wasAccused = (sipahiTargetId === p.id);
            s = wasAccused ? P.VIDUSHAK_WIN : P.VIDUSHAK_LOSS;
        }
        roundScores[p.id] = s * multiplier;
    });

    return roundScores;
  }

  // --- INTEGRATED ECONOMY CALL ---
  function processEconomyRewards(pointMap, isCorrect, players) {
    // We use Economy.award() from economy.js
    // MAPPING:
    // If you got 0 points -> GAME_LOSS
    // If you got > 0 points -> GAME_WIN (Simplified for now)
    // Or we can just award fixed amounts based on win/loss of the round context.
    
    // Since Economy.award() operates on "current user", we can't loop easily for all.
    // However, economy.js is designed for single-user client side usually.
    // SOLUTION: We update the database directly here mimicking Economy.js logic 
    // BUT since we want to be "updated according to economy.js", we should use its methods if possible.
    // Constraint: Economy.award uses `firebase.auth().currentUser`. 
    // Thus, each client must call it themselves OR the host updates everyone's doc.
    // Host updating everyone is safer to prevent cheating.
    
    // Let's implement Host-Side Batch Update mimicking Economy.award structure.
    
    const db = firebase.firestore();
    const batch = db.batch();

    players.forEach(p => {
        const pts = pointMap[p.id] || 0;
        const ref = db.collection('users').doc(p.id);
        
        // Logic from Economy.js: 
        // Win = 100 coins, 150 xp
        // Loss = 20 coins, 50 xp
        // We define "Win" as getting > 0 points in the round.
        const isWin = pts > 0;
        const coinGain = isWin ? 100 : 20;
        const xpGain = isWin ? 150 : 50;
        
        // Increment
        batch.set(ref, {
            coins: firebase.firestore.FieldValue.increment(coinGain),
            xp: firebase.firestore.FieldValue.increment(xpGain),
            seasonXp: firebase.firestore.FieldValue.increment(xpGain) // Season progress
        }, { merge: true });
    });

    batch.commit().then(() => console.log("Economy rewards distributed."));
  }

  // ============================================================================
  // --- 10. HOST CONTROL PANEL (WAITING ROOM) ---
  // ============================================================================
  function renderJoinRequestsPanel(pending, roomRef) {
    if (!joinRequestsPanel) return;
    
    if (!pending || pending.length === 0) {
      joinRequestsPanel.innerHTML = `<div class="text-[10px] text-gray-500 font-mono italic text-center py-2">NO INCOMING SIGNALS</div>`;
      return;
    }

    joinRequestsPanel.innerHTML = pending.map(p => `
        <div class="border border-gray-800 bg-black/40 rounded px-3 py-2 mb-2 text-xs flex items-center justify-between animate-fade-in">
          <div>
            <div class="text-gray-100 font-mono font-bold">${p.name}</div>
            <div class="text-[9px] text-gray-500">ID: ${p.id.substring(0,6)}...</div>
          </div>
          <div class="flex gap-2">
            <button class="text-[9px] px-2 py-1 border border-neon-green text-neon-green rounded hover:bg-neon-green/20 transition approve-btn" data-id="${p.id}">
              ACCEPT
            </button>
            <button class="text-[9px] px-2 py-1 border border-red-500 text-red-500 rounded hover:bg-red-500/20 transition deny-btn" data-id="${p.id}">
              REJECT
            </button>
          </div>
        </div>
    `).join("");

    // Bind events
    joinRequestsPanel.onclick = (e) => {
        const abtn = e.target.closest(".approve-btn");
        const dbtn = e.target.closest(".deny-btn");
        if (!abtn && !dbtn) return;
        
        const targetId = (abtn || dbtn).dataset.id;
        const player = pending.find(p => p.id === targetId);
        if (!player) return;

        if (abtn) {
            // Approve: Move to players, Remove from pending
            roomRef.update({
                players: firebase.firestore.FieldValue.arrayUnion(player),
                pendingJoins: firebase.firestore.FieldValue.arrayRemove(player),
                [`scores.${player.id}`]: 0
            }).then(() => window.showToast(`Agent ${player.name} authorized.`, "success"));
        } else {
            // Deny: Remove from pending
            roomRef.update({
                pendingJoins: firebase.firestore.FieldValue.arrayRemove(player)
            }).then(() => window.showToast(`Agent ${player.name} rejected.`, "info"));
        }
    };
  }

  // ============================================================================
  // --- 11. MISC HELPERS (Chat, List, History) ---
  // ============================================================================
  
  function renderPlayersList(players, hostId, selfId, isSelfHost, mutedIds, roomRef) {
    if (!playersListEl) return;
    const mutedSet = new Set(mutedIds || []);
    
    playersListEl.innerHTML = players.map(p => {
        const isHost = p.id === hostId;
        const isVip = !!p.isVip;
        const isMuted = mutedSet.has(p.id);
        const isSelf = p.id === selfId;
        
        const badge = isHost ? "HOST" : isVip ? "VIP" : "AGENT";
        const badgeColor = isHost ? "text-neon-blue" : isVip ? "text-yellow-400" : "text-gray-500";
        
        // Host Controls
        let actions = `<div class="text-[10px] text-gray-500">● ONLINE</div>`;
        if (isSelfHost && !isHost) {
            actions = `
                <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button class="text-[9px] text-red-400 hover:text-red-200" data-kick="${p.id}">KICK</button>
                    <button class="text-[9px] ${isMuted?'text-yellow-400':'text-gray-400'}" data-mute="${p.id}">${isMuted?'UNMUTE':'MUTE'}</button>
                </div>
            `;
        }

        return `
          <div class="group flex items-center justify-between px-3 py-2 border border-gray-800 rounded-lg bg-black/40 text-xs mb-1 w-full max-w-xs transition hover:bg-white/5">
            <div class="flex items-center gap-2">
              <div class="w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center text-[10px] font-bold border border-gray-600">
                ${p.name.charAt(0).toUpperCase()}
              </div>
              <div class="flex flex-col">
                <span class="font-mono" style="${getNameStyleForPlayer(p, hostId)}">
                  ${isSelf ? "[YOU] " : ""}${p.name}
                </span>
                <span class="text-[9px] ${badgeColor} uppercase tracking-wider">${badge}</span>
              </div>
            </div>
            ${actions}
          </div>
        `;
    }).join("");

    // Bind Kick/Mute
    if (isSelfHost) {
        playersListEl.querySelectorAll("[data-kick]").forEach(b => {
            b.onclick = () => {
                const pid = b.dataset.kick;
                window.confirmAction("KICK AGENT?", "Remove this operative from the session?", () => {
                    roomRef.update({
                        players: players.filter(pl => pl.id !== pid),
                        [`scores.${pid}`]: firebase.firestore.FieldValue.delete()
                    });
                }, true);
            };
        });
        playersListEl.querySelectorAll("[data-mute]").forEach(b => {
            b.onclick = () => {
                const pid = b.dataset.mute;
                const isM = mutedSet.has(pid);
                roomRef.update({
                    muted: isM ? firebase.firestore.FieldValue.arrayRemove(pid) : firebase.firestore.FieldValue.arrayUnion(pid)
                });
            };
        });
    }
  }

  function renderAvatarsTable(players, selfId) {
    const table = document.querySelector(".game-table");
    if (!table) return;
    table.querySelectorAll(".avatar").forEach(e => e.remove());
    
    const N = players.length;
    if (N === 0) return;
    
    const radius = 130;
    const cx = 160; 
    const cy = 160;
    const selfIdx = players.findIndex(p => p.id === selfId);

    players.forEach((p, i) => {
        // Rotate so self is at bottom (90 deg)
        const logicalIdx = (i - selfIdx + N) % N;
        const angle = Math.PI / 2 + (2 * Math.PI * logicalIdx) / N;
        
        const x = cx + radius * Math.cos(angle) - 35;
        const y = cy + radius * Math.sin(angle) - 35;
        
        const el = document.createElement("div");
        el.className = "avatar animate-pop-in";
        el.style.left = x + "px";
        el.style.top = y + "px";
        
        let icon = "👤";
        if (p.inventory) {
            if (p.inventory.includes("robot_avatar")) icon = "🤖";
            else if (p.inventory.includes("alien_avatar")) icon = "👽";
        }
        
        const isSelf = p.id === selfId;
        el.innerHTML = `
            <span class="text-3xl drop-shadow-md">${icon}</span>
            <div class="avatar-name ${isSelf ? 'avatar-name-self' : ''}">${p.name}</div>
        `;
        
        if (isSelf) {
            el.style.borderColor = "#00f3ff";
            el.style.boxShadow = "0 0 15px rgba(0, 243, 255, 0.4)";
        }
        table.appendChild(el);
    });
  }

  function renderChatLog(chatArr, selfId) {
    if (!chatLogEl) return;
    // Optimize: only update if length changed
    // For simplicity re-render but typically you'd append
    chatLogEl.innerHTML = chatArr.map(m => {
        const isSelf = m.uid === selfId;
        const text = decryptChatText(m.enc);
        return `
            <div class="flex items-start gap-2 ${isSelf ? 'justify-end' : 'justify-start'} mb-1">
                <div class="px-2 py-1 rounded border ${isSelf ? 'border-neon-blue/50 text-neon-blue bg-neon-blue/10' : 'border-gray-700 text-gray-300 bg-black/60'} max-w-[85%]">
                    <div class="text-[9px] opacity-70 mb-0.5 uppercase tracking-wider">${isSelf ? 'YOU' : m.name}</div>
                    <div class="text-[11px] break-words leading-tight">${text.replace(/</g, "&lt;")}</div>
                </div>
            </div>
        `;
    }).join("");
    chatLogEl.scrollTop = chatLogEl.scrollHeight;
  }

  function renderScoreboard(scores, players) {
    if (!scoreListEl) return;
    const sorted = players
        .map(p => ({ ...p, score: scores[p.id] || 0 }))
        .sort((a, b) => b.score - a.score);
        
    scoreListEl.innerHTML = sorted.map((p, i) => `
        <div class="flex justify-between items-center py-1.5 border-b border-gray-800/50 last:border-0">
            <span class="${i===0 ? 'text-neon-green font-bold' : 'text-gray-400'} text-xs">
                ${i+1}. ${p.name}
            </span>
            <span class="font-mono text-neon-pink text-xs">${p.score}</span>
        </div>
    `).join("");
  }

  function getRoleIcon(role) {
    const icons = {
        "Raja": "👑", "Rani": "👸", "Mantri": "🧠", "Sipahi": "🛡️",
        "Chor": "🔪", "Praja": "👤", "Jasoos": "🕵️", "Vidushak": "🤡"
    };
    return icons[role] || "❓";
  }

  function getRoleDescription(role) {
    const desc = {
        "Raja": "Leader. High Value Target.",
        "Sipahi": "Protector. Identify the Chor.",
        "Chor": "Infiltrator. Don't get caught.",
        "Mantri": "Advisor. Support the Raja.",
        "Vidushak": "Trickster. Wants to be accused.",
        "Jasoos": "Spy. Gains intel.",
        "Rani": "Royal. High points."
    };
    return desc[role] || "Civilian";
  }

  // --- UI v2.0 HISTORY MODAL ---
  if (openHistoryBtn) {
    openHistoryBtn.onclick = () => {
        if (!roomId) return window.showToast("No active mission logs.", "error");
        
        const html = `
            <div id="roomHistoryWrapper" class="mb-4 text-xs text-gray-200 min-h-[100px] max-h-[200px] overflow-y-auto">
                <div class="text-center text-gray-500 mt-4"><span class="gn-spinner"></span> ACCESSING ARCHIVES...</div>
            </div>
            <div class="flex justify-center border-t border-gray-800 pt-4">
                <button id="showGlobalBtn" class="gn-btn text-[10px]">ACCESS GLOBAL DATABASE</button>
            </div>
            <div id="globalRankingWrapper" class="mt-4 text-xs text-gray-200 hidden max-h-[200px] overflow-y-auto"></div>
        `;
        
        window.showCustomModal("MISSION ARCHIVES", html);
        
        // Load data async
        loadRoomHistory(roomId);
        
        setTimeout(() => {
            const btn = document.getElementById("showGlobalBtn");
            const glob = document.getElementById("globalRankingWrapper");
            if (btn) btn.onclick = () => {
                if (glob.classList.contains("hidden")) {
                    glob.classList.remove("hidden");
                    btn.innerText = "CLOSE GLOBAL DATABASE";
                    loadGlobalRanking(glob);
                } else {
                    glob.classList.add("hidden");
                    btn.innerText = "ACCESS GLOBAL DATABASE";
                }
            };
        }, 100);
    };
  }

  async function loadRoomHistory(code) {
    const wrap = document.getElementById("roomHistoryWrapper");
    try {
        const snap = await db.collection("rmcs_rooms").doc(code).get();
        const h = (snap.data().history || []).reverse(); // Newest first
        
        if (h.length === 0) {
            wrap.innerHTML = `<div class="text-center text-gray-500 italic py-4">NO RECORDS FOUND</div>`;
            return;
        }

        wrap.innerHTML = h.map((entry, i) => `
            <div class="border-b border-gray-800 py-2 mb-1">
                <div class="flex justify-between mb-1">
                    <span class="text-gray-400">LOG #${h.length - i}</span>
                    <span class="${entry.result === 'Caught' ? 'text-neon-green' : 'text-red-500'} font-bold">${entry.result}</span>
                </div>
                <div class="grid grid-cols-4 gap-1 text-[10px] text-gray-500">
                   ${entry.roles.slice(0,4).map(r => `<div>${r.role.substring(0,3)}: <span class="text-gray-300">${r.name}</span></div>`).join("")}
                </div>
            </div>
        `).join("");
    } catch(e) { wrap.innerHTML = "Error loading logs."; }
  }

  async function loadGlobalRanking(wrap) {
    wrap.innerHTML = `<div class="text-center text-gray-500"><span class="gn-spinner"></span> DOWNLOADING...</div>`;
    try {
        const snap = await db.collection("users").orderBy("xp", "desc").limit(10).get();
        wrap.innerHTML = `
            <table class="w-full text-left border-collapse">
                <thead class="text-gray-500 border-b border-gray-700">
                    <tr><th class="py-1">RANK</th><th class="py-1">AGENT</th><th class="py-1 text-right">XP</th></tr>
                </thead>
                <tbody>
                    ${snap.docs.map((d, i) => `
                        <tr class="border-b border-gray-800/50">
                            <td class="py-1 text-neon-blue">#${i+1}</td>
                            <td class="py-1 text-white">${d.data().username || 'Unknown'}</td>
                            <td class="py-1 text-right text-neon-pink">${d.data().xp || 0}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;
    } catch(e) { wrap.innerHTML = "Connection failed."; }
  }

  // --- UI v2.0 FEEDBACK ---
  function showFeedbackModal(reason) {
     const html = `
        <div class="text-left">
            <label class="block text-neon-blue text-xs mb-1">AGENT ID</label>
            <input id="fb-name" class="w-full bg-black border border-gray-700 p-2 text-white mb-3 text-xs focus:border-neon-blue outline-none" placeholder="Optional">
            <label class="block text-neon-blue text-xs mb-1">DEBRIEF</label>
            <textarea id="fb-text" class="w-full bg-black border border-gray-700 p-2 text-white h-20 text-xs focus:border-neon-blue outline-none resize-none"></textarea>
            <div class="flex justify-end gap-2 mt-4">
                <button class="gn-btn text-xs" onclick="window.closeModal()">SKIP</button>
                <button id="fb-submit" class="gn-btn primary text-xs">TRANSMIT</button>
            </div>
        </div>
     `;
     window.showCustomModal("MISSION DEBRIEF", html);
     
     setTimeout(() => {
        const btn = document.getElementById("fb-submit");
        if(btn) btn.onclick = async () => {
            window.setBtnLoading(btn, true, "SENDING...");
            const name = document.getElementById("fb-name").value;
            const text = document.getElementById("fb-text").value;
            try {
                if(roomId) await db.collection("rmcs_feedback").add({
                    roomId, reason, name, text, ts: firebase.firestore.FieldValue.serverTimestamp()
                });
                window.showToast("Feedback sent.", "success");
            } catch(e){}
            window.closeModal();
            if(postFeedbackAction) postFeedbackAction();
        };
     }, 100);
  }

  // --- CHAT SENDER ---
  async function sendChatMessage() {
      if (!roomId || !chatInputEl.value.trim()) return;
      const text = chatInputEl.value.trim().slice(0, CHAT_MAX_MESSAGE_LENGTH);
      
      try {
          const uid = await requireAuth();
          const roomRef = db.collection("rmcs_rooms").doc(roomId);
          const snap = await roomRef.get();
          if(!snap.exists) return;
          
          const d = snap.data();
          const counts = d.chatMessageCounts || {};
          const myCount = counts[uid] || 0;
          const limit = (currentUserData.inventory && currentUserData.inventory.includes("vip_pass")) ? CHAT_VIP_LIMIT : CHAT_FREE_LIMIT;
          
          if(myCount >= limit) return window.showToast("Comms limit reached.", "error");

          const msg = {
              id: Date.now() + "_" + uid,
              uid,
              name: currentUserData.username || "Agent",
              enc: encryptChatText(text),
              ts: firebase.firestore.FieldValue.serverTimestamp()
          };

          let newChat = (d.chat || []).concat(msg);
          if (newChat.length > CHAT_HISTORY_LIMIT) newChat = newChat.slice(-CHAT_HISTORY_LIMIT);

          await roomRef.update({
              chat: newChat,
              [`chatMessageCounts.${uid}`]: myCount + 1
          });
          
          chatInputEl.value = "";
          playSound("click");
      } catch(e) { window.showToast("Transmission failed.", "error"); }
  }

  if(chatSendBtnEl) chatSendBtnEl.onclick = sendChatMessage;
  if(chatInputEl) chatInputEl.onkeydown = (e) => { if(e.key === "Enter") sendChatMessage(); };

  // --- AUTO JOIN URL ---
  (function autoJoin() {
      const p = new URLSearchParams(location.search);
      const r = p.get("room");
      if(r) {
          showScreen(joinScreen);
          const inp = getEl("joinRoomCode");
          if(inp) inp.value = r;
      }
  })();

  // --- PUBLIC LOBBY BROWSER ---
  function startLobbyBrowser() {
      if (!publicLobbiesList) return;
      const q = db.collection("rmcs_rooms").where("phase", "==", "lobby").where("visibility", "==", "public");
      unsubscribeLobbyList = q.onSnapshot(snap => {
          if(snap.empty) { publicLobbiesList.innerHTML = `<div class="text-gray-500 italic text-xs">NO PUBLIC SIGNALS DETECTED.</div>`; return; }
          
          publicLobbiesList.innerHTML = snap.docs.map(d => {
              const r = d.data();
              return `
                <div class="border border-gray-800 bg-black/40 rounded px-3 py-2 flex justify-between items-center mb-1">
                    <div>
                        <div class="text-neon-blue font-bold text-sm tracking-widest">${d.id}</div>
                        <div class="text-[10px] text-gray-500">${(r.players||[]).length}/${r.maxPlayers||8} AGENTS</div>
                    </div>
                    <button class="gn-btn text-[10px] px-2 py-1 join-pub-btn" data-code="${d.id}">JOIN</button>
                </div>
              `;
          }).join("");
          
          publicLobbiesList.querySelectorAll(".join-pub-btn").forEach(b => {
              b.onclick = () => {
                  showScreen(joinScreen);
                  getEl("joinRoomCode").value = b.dataset.code;
              };
          });
      });
  }
  
  startLobbyBrowser();

});
