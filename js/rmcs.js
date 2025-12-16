document.addEventListener("DOMContentLoaded", function () {
  // --- 1. INITIALIZATION ---
  if (typeof firebase === "undefined") {
    console.error("Firebase missing");
    return;
  }
  const db = firebase.firestore();
  let unsubscribe = null;
  let roomId = "";
  let currentUserData = null;
  let lastPhase = "";
  const MIN_PLAYERS = 4;
  const MAX_PLAYERS = 8; 

  // NEW: keep track of pending join requests locally (for host)
  let lastPendingJoins = [];

  // --- CHAT CONSTANTS (LIMITS + ENCRYPTION) ---
  const CHAT_HISTORY_LIMIT = 150;          
  const CHAT_FREE_LIMIT = 80;              
  const CHAT_VIP_LIMIT = 220;              
  const CHAT_MAX_MESSAGE_LENGTH = 240;     
  const CHAT_SECRET = "rmcs_v1_chat_key";  

  // --- 2. DOM ELEMENTS ---
  const getEl = (id) => document.getElementById(id);
  const mainMenu = getEl("mainMenu");
  const createScreen = getEl("createScreen");
  const joinScreen = getEl("joinScreen");
  const gameScreen = getEl("gameScreen");
  const storeScreen = getEl("storeScreen");
  const gameContent = getEl("gameContent");
  const playersListEl = getEl("playersList");
  const currentRoomCode = getEl("currentRoomCode");
  const copyCodeBtn = getEl("copyCodeBtn");
  const copyLinkBtn = getEl("copyLinkBtn");
  const roomPlayerCountEl = getEl("roomPlayerCount");
  const roomMaxPlayersEl = getEl("roomMaxPlayers");
  const roomMinPlayersEl = getEl("roomMinPlayers");
  const scoreListEl = getEl("scoreList");
  const startGameBtn = getEl("startGameBtn");
  const cancelRoomBtn = getEl("cancelRoomBtn");
  const openStoreBtn = getEl("openStoreBtn");
  const userCoinsEl = getEl("userCoins");
  const storeGrid = getEl("storeGrid");
  
  // History & Feedback buttons
  const openHistoryBtn = getEl("openHistoryBtn");
  const publicLobbiesList = getEl("publicLobbiesList");

  // NEW: create‑room options + host join‑request panel
  const roomVisibilitySelect = getEl("roomVisibility");      
  const waitingRoomToggle = getEl("waitingRoomToggle");      
  const requireApprovalCheckbox = getEl("requireApprovalCheckbox"); 
  const joinRequestsPanel = getEl("joinRequestsPanel");      

  // NEW: CHAT DOM
  const chatLogEl = getEl("chatLog");
  const chatInputEl = getEl("chatInput");
  const chatSendBtnEl = getEl("chatSendBtn");
  const chatQuotaEl = getEl("chatQuota");

  let unsubscribeLobbyList = null;
  const roundTransition = getEl("roundTransition");

  // --- FEEDBACK STATE ---
  let postFeedbackAction = null;

  // --- DISCONNECT → REMOVE PLAYER FROM ROOM ---
  async function leaveCurrentRoom() {
    if (!roomId) return;
    const user = firebase.auth().currentUser;
    if (!user) return;
    const uid = user.uid;
    const roomRef = db.collection("rmcs_rooms").doc(roomId);
    try {
      const snap = await roomRef.get();
      if (!snap.exists) return;
      const data = snap.data();
      const oldPlayers = data.players || [];
      const newPlayers = oldPlayers.filter((p) => p.id !== uid);
      const newScores = { ...(data.scores || {}) };
      delete newScores[uid];
      const newMuted = (data.muted || []).filter((id) => id !== uid);
      // also drop from pendingJoins if present
      const oldPending = data.pendingJoins || [];
      const newPending = oldPending.filter((p) => p.id !== uid);
      // If host leaves, either transfer host or delete room
      if (uid === data.host) {
        if (newPlayers.length === 0) {
          await roomRef.delete();
          return;
        } else {
          await roomRef.update({
            host: newPlayers[0].id,
            players: newPlayers,
            scores: newScores,
            muted: newMuted,
            pendingJoins: newPending
          });
        }
      } else {
        await roomRef.update({
          players: newPlayers,
          scores: newScores,
          muted: newMuted,
          pendingJoins: newPending
        });
      }
    } catch (e) {
      console.error("leaveCurrentRoom failed", e);
    } finally {
      roomId = "";
    }
  }

  // NEW: try to clean up when tab closes / refreshes
  window.addEventListener("beforeunload", () => {
    leaveCurrentRoom();
  });

  // Lobby meta labels
  if (roomMaxPlayersEl) roomMaxPlayersEl.textContent = MAX_PLAYERS;
  if (roomMinPlayersEl) roomMinPlayersEl.textContent = MIN_PLAYERS;

  // --- NAME STYLES (HOST / VIP / NORMAL) ---
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

  // --- LIGHTWEIGHT CHAT ENCRYPTION HELPERS ---
  function encryptChatText(plain) {
    try {
      const key = CHAT_SECRET;
      let out = "";
      for (let i = 0; i < plain.length; i++) {
        const c = plain.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        out += String.fromCharCode(c);
      }
      return btoa(out);
    } catch (e) {
      console.error("encryptChatText failed", e);
      return "";
    }
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
    } catch (e) {
      return "[message corrupted]";
    }
  }

  // --- 3. SOUND ENGINE ---
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

  // --- 4. AUTH & USER DATA ---
  firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
      await loadUserData(user.uid);
    }
  });
  async function loadUserData(uid) {
    const userRef = db.collection("users").doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) {
      const initialData = {
        username: "Agent_" + uid.substring(0, 4),
        coins: 100, xp: 0, seasonXp: 0, inventory: [],
        joinedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await userRef.set(initialData);
      currentUserData = initialData;
    } else {
      currentUserData = snap.data();
      if (typeof currentUserData.coins !== "number") currentUserData.coins = 0;
      if (typeof currentUserData.xp !== "number") currentUserData.xp = 0;
      if (typeof currentUserData.seasonXp !== "number") currentUserData.seasonXp = 0;
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

  // --- AI GAME MASTER TERMINAL ---
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
    line.className = "border border-gray-800 rounded px-2 py-1 bg-black/40";
    line.innerHTML = `<span class="text-gray-500 mr-1">[${stamp}]</span><span class="${colorClass} font-bold">GM:</span><span class="text-gray-300 ml-1">${message}</span>`;
    box.prepend(line);
    while (box.children.length > 25) { box.removeChild(box.lastChild); }
  }

  // --- 5. IN‑GAME SHOP ---
  const STORE_ITEMS = [
    { id: "robot_avatar", name: "Robot Avatar", type: "avatars", price: 200, requiresVip: false, emoji: "🤖", desc: "Synthetic operative shell." },
    { id: "alien_avatar", name: "Alien Avatar", type: "avatars", price: 250, requiresVip: true, emoji: "👽", desc: "Classified identity." },
    { id: "gold_name", name: "Gold Nameplate", type: "colors", price: 300, requiresVip: true, emoji: "🏅", desc: "Mark yourself as high‑value asset." },
    { id: "cyan_name", name: "Neon Cyan Tag", type: "colors", price: 120, requiresVip: false, emoji: "💠", desc: "Clean cyber aesthetic." },
    { id: "meme_pack", name: "Meme Sound Pack", type: "sounds", price: 180, requiresVip: false, emoji: "😂", desc: "Sabash / Failure / Drum Roll pack." },
    { id: "vip_pass", name: "VIP Protocol Access", type: "colors", price: 500, requiresVip: false, emoji: "⭐", desc: "Unlock VIP skins & cosmetics." }
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
        return `
          <div class="border border-gray-800 rounded-lg bg-black/50 p-3 flex flex-col justify-between text-xs font-mono">
            <div>
              <div class="flex items-center justify-between mb-1">
                <span class="text-lg">${item.emoji}</span>
                ${item.requiresVip ? '<span class="text-[9px] text-yellow-400 uppercase tracking-[0.2em]">VIP</span>' : ""}
              </div>
              <div class="font-bold text-white mb-1">${item.name}</div>
              <div class="text-gray-400 text-[11px] mb-2">${item.desc}</div>
            </div>
            <div class="flex items-center justify-between mt-2">
              <span class="text-yellow-400 text-[11px]">💰 ${item.price}</span>
              ${owned ? '<span class="text-[10px] text-neon-green uppercase tracking-[0.2em]">OWNED</span>' : needsVip ? '<span class="text-[10px] text-red-400 uppercase tracking-[0.2em]">NEED VIP PASS</span>' : `<button class="px-2 py-1 text-[10px] uppercase tracking-[0.2em] border border-neon-blue rounded hover:bg-neon-blue/20 transition buy-item-btn" data-item-id="${item.id}">BUY</button>`}
            </div>
          </div>`;
      }).join("");
    const buyButtons = storeGrid.querySelectorAll(".buy-item-btn");
    buyButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-item-id");
        const item = STORE_ITEMS.find((i) => i.id === id);
        if (item) purchaseItem(item);
      });
    });
  }
  async function purchaseItem(item) {
    if (!currentUserData) { showToast("Login error. Please re‑load.", "error"); return; }
    if (ownsItem(item.id)) { showToast("Already acquired.", "error"); return; }
    if (item.requiresVip && !userHasVip()) { showToast("Requires VIP PASS.", "error"); return; }
    const coins = currentUserData.coins ?? 0;
    if (coins < item.price) { showToast("Insufficient credits.", "error"); return; }
    try {
      const uid = await requireAuth();
      const userRef = db.collection("users").doc(uid);
      await userRef.update({
        coins: coins - item.price,
        inventory: firebase.firestore.FieldValue.arrayUnion(item.id)
      });
      currentUserData.coins = coins - item.price;
      if (!Array.isArray(currentUserData.inventory)) currentUserData.inventory = [];
      currentUserData.inventory.push(item.id);
      refreshUserCoinsUI();
      renderStore(item.type);
      playSound("cash");
      showToast("Purchase successful.", "success");
    } catch (e) { console.error(e); showToast("Purchase failed.", "error"); }
  }

  // Expose filterStore globally
  window.filterStore = function (category) {
    const tabs = document.querySelectorAll(".store-tab");
    tabs.forEach((tab) => {
      if (tab.textContent.toLowerCase().includes(category.slice(0, 3))) {
        tab.classList.add("text-white"); tab.classList.remove("text-gray-500");
      } else {
        tab.classList.remove("text-white"); tab.classList.add("text-gray-500");
      }
    });
    renderStore(category);
  };

  // --- PUBLIC LOBBY BROWSER ---
  function startLobbyBrowser() {
    if (!publicLobbiesList) return;
    if (unsubscribeLobbyList) { unsubscribeLobbyList(); unsubscribeLobbyList = null; }
    const q = db.collection("rmcs_rooms").where("phase", "==", "lobby").where("visibility", "==", "public");
    unsubscribeLobbyList = q.onSnapshot((snap) => {
      if (snap.empty) {
        publicLobbiesList.innerHTML = '<div class="text-gray-500 italic">No public rooms online.</div>';
        return;
      }
      const rooms = snap.docs.map((doc) => {
          const d = doc.data();
          const players = (d.players || []).length;
          const max = (typeof d.maxPlayers === "number") ? d.maxPlayers : 8;
          const hostName = (d.players && d.players[0] && d.players[0].name) || "Host";
          return { code: doc.id, players, max, hostName, created: d.created ? d.created.toDate() : null };
        }).sort((a, b) => (b.created?.getTime() || 0) - (a.created?.getTime() || 0));
      publicLobbiesList.innerHTML = rooms.map((r) => `
        <div class="border border-gray-800 rounded bg-black/40 px-3 py-2 flex items-center justify-between">
          <div>
            <div class="text-gray-100"><span class="text-neon-blue font-bold tracking-[0.2em]">${r.code}</span></div>
            <div class="text-[10px] text-gray-400 mt-0.5">Host: <span class="text-gray-200">${r.hostName}</span> · ${r.players}/${r.max} operatives</div>
          </div>
          <button class="px-2 py-1 text-[10px] uppercase tracking-[0.2em] border border-neon-blue rounded hover:bg-neon-blue/20 transition join-public-btn" data-room-code="${r.code}">Join</button>
        </div>`).join("");
    });
  }
  if (publicLobbiesList) {
    publicLobbiesList.addEventListener("click", (e) => {
      const btn = e.target.closest(".join-public-btn");
      if (!btn) return;
      showScreen(joinScreen);
      const joinCodeInput = getEl("joinRoomCode");
      if (joinCodeInput) joinCodeInput.value = btn.getAttribute("data-room-code");
    });
  }

  // --- 6. NAVIGATION / SCREEN SWITCHING ---
  function showScreen(screen) {
    [mainMenu, createScreen, joinScreen, gameScreen, storeScreen].forEach((s) => {
      if (s) { s.classList.remove("active-screen"); s.style.display = "none"; }
    });
    if (screen) { screen.style.display = "block"; screen.classList.add("active-screen"); }
  }
  document.querySelectorAll(".create-btn").forEach((b) => (b.onclick = () => { showScreen(createScreen); }));
  document.querySelectorAll(".join-btn").forEach((b) => (b.onclick = () => { showScreen(joinScreen); }));
  document.querySelectorAll(".back-btn").forEach((b) => (b.onclick = () => { showScreen(mainMenu); }));
  if (openStoreBtn && storeScreen) {
    openStoreBtn.onclick = () => { showScreen(storeScreen); refreshUserCoinsUI(); window.filterStore("avatars"); };
  }
  if (copyCodeBtn) {
    copyCodeBtn.onclick = () => {
      const code = currentRoomCode ? currentRoomCode.innerText.trim() : "";
      if (code) navigator.clipboard.writeText(code).then(() => showToast("Room code copied!", "success"));
    };
  }
  if (copyLinkBtn) {
    copyLinkBtn.onclick = () => {
      const code = currentRoomCode ? currentRoomCode.innerText.trim() : "";
      if (code) {
        const link = `${window.location.origin}${window.location.pathname}?room=${code}`;
        navigator.clipboard.writeText(link).then(() => showToast("Invite link copied!", "success"));
      }
    };
  }
  
  // --- UI v2.0: MANUAL DISCONNECT ---
  const exitLobbyBtn = getEl("exitLobbyBtn");
  if (exitLobbyBtn) {
    exitLobbyBtn.onclick = () => {
      confirmAction("DISCONNECT?", "Leave the current mission lobby?", async () => {
        await leaveCurrentRoom();
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        postFeedbackAction = () => { showScreen(mainMenu); };
        showFeedbackModal("manual_disconnect");
      }, true);
    };
  }

  // --- UI v2.0: FEEDBACK MODAL ---
  function showFeedbackModal(reason) {
    const modalHtml = `
      <div class="text-left">
        <div class="mb-4">
          <label class="block text-neon-blue text-xs mb-1">AGENT NAME</label>
          <input type="text" id="gn-feedback-name" class="cyber-input w-full text-sm" placeholder="Anonymous">
        </div>
        <div class="mb-4">
          <label class="block text-neon-blue text-xs mb-1">DEBRIEF LOG</label>
          <textarea id="gn-feedback-text" class="cyber-input w-full h-24 text-sm resize-none"></textarea>
        </div>
        <div class="flex gap-3 justify-end mt-6">
          <button class="gn-btn" onclick="document.querySelector('.gn-overlay').style.display='none'">SKIP</button>
          <button class="gn-btn primary" id="gn-submit-feedback-btn">TRANSMIT DATA</button>
        </div>
      </div>
    `;
    // We access showCustomModal from ui.js globally
    window.showCustomModal("MISSION DEBRIEF", modalHtml);

    setTimeout(() => {
        const btn = document.getElementById("gn-submit-feedback-btn");
        if(btn) {
            btn.onclick = async () => {
                window.setBtnLoading("gn-submit-feedback-btn", true, "TRANSMITTING...");
                const nameVal = document.getElementById("gn-feedback-name").value;
                const textVal = document.getElementById("gn-feedback-text").value;
                try {
                    if (db && roomId) {
                        await db.collection("rmcs_feedback").add({
                            roomId, reason,
                            name: nameVal || "Anonymous",
                            text: textVal,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        showToast("Feedback transmitted.", "success");
                    }
                } catch (e) { showToast("Transmission failed.", "error"); }
                window.setBtnLoading("gn-submit-feedback-btn", false);
                document.querySelector('.gn-overlay').style.display='none'; // Close modal
                if (typeof postFeedbackAction === "function") { postFeedbackAction(); postFeedbackAction = null; }
            };
        }
    }, 100);
  }

  // --- 7. CREATE / JOIN LOGIC (With Safety Fixes) ---
  const createRoomFinal = getEl("createRoomFinal");
  if (createRoomFinal) {
    createRoomFinal.onclick = async () => {
      window.showLoading("DEPLOYING SERVER...");
      const nameVal = getEl("createPlayerName").value.trim();
      const codeVal = getEl("createRoomCode").value.trim().toUpperCase() || Math.random().toString(36).substring(2, 6).toUpperCase();
      if (!nameVal) { window.hideLoading(); return showToast("Agent Name Required", "error"); }

      try {
        const uid = await requireAuth();
        const ref = db.collection("rmcs_rooms").doc(codeVal);
        if ((await ref.get()).exists) { window.hideLoading(); return showToast("Code Taken", "error"); }

        const isVip = !!(currentUserData && currentUserData.inventory && currentUserData.inventory.includes("vip_pass"));
        const playerData = { id: uid, name: nameVal, inventory: currentUserData?.inventory || [], isVip, nameColor: isVip ? "gold" : "white", roleType: "host" };

        const visibility = (() => {
          const radio = document.querySelector('input[name="roomVisibility"]:checked');
          if (radio && radio.value === "personal") return "personal";
          if (roomVisibilitySelect && roomVisibilitySelect.value === "personal") return "personal";
          return "public";
        })();
        const waitingRoomEnabled = visibility === "personal" && ((waitingRoomToggle && waitingRoomToggle.checked) || (requireApprovalCheckbox && requireApprovalCheckbox.checked));

        await ref.set({
          host: uid, players: [playerData], phase: "lobby", scores: { [uid]: 0 }, muted: [], history: [],
          created: firebase.firestore.FieldValue.serverTimestamp(),
          maxPlayers: MAX_PLAYERS, visibility, waitingRoomEnabled: !!waitingRoomEnabled,
          pendingJoins: [], chat: [], chatMessageCounts: {}
        });
        window.hideLoading(); roomId = codeVal; listenToRoom(roomId); showScreen(gameScreen);
      } catch (e) { window.hideLoading(); console.error(e); showToast("Deploy Failed", "error"); }
    };
  }

  const joinRoomFinal = getEl("joinRoomFinal");
  if (joinRoomFinal) {
    joinRoomFinal.onclick = async () => {
      window.showLoading("CONNECTING...");
      const nameVal = getEl("joinPlayerName").value.trim();
      const codeVal = getEl("joinRoomCode").value.trim().toUpperCase();
      if (!nameVal || !codeVal) { window.hideLoading(); return showToast("Credentials Missing", "error"); }
      try {
        const uid = await requireAuth();
        const ref = db.collection("rmcs_rooms").doc(codeVal);
        const snap = await ref.get();
        if (!snap.exists) { window.hideLoading(); return showToast("Room Not Found", "error"); }
        const data = snap.data();
        const isVip = !!(currentUserData && currentUserData.inventory && currentUserData.inventory.includes("vip_pass"));
        const roleType = uid === data.host ? "host" : isVip ? "vip" : "normal";
        const playerData = { id: uid, name: nameVal, inventory: currentUserData?.inventory || [], isVip, nameColor: isVip ? "gold" : "white", roleType };
        const players = data.players || [];
        const pending = data.pendingJoins || [];
        const alreadyPlayer = players.some((p) => p.id === uid);
        const alreadyPending = pending.some((p) => p.id === uid);

        if (!alreadyPlayer && players.length >= (data.maxPlayers || MAX_PLAYERS)) { window.hideLoading(); return showToast("Squad Full", "error"); }
        
        if (!alreadyPlayer && !alreadyPending) {
          if (data.visibility === "public" && !data.waitingRoomEnabled) {
            await ref.update({ players: firebase.firestore.FieldValue.arrayUnion(playerData), [`scores.${uid}`]: 0 });
          } else {
            await ref.update({ pendingJoins: firebase.firestore.FieldValue.arrayUnion({ ...playerData, requestedAt: firebase.firestore.FieldValue.serverTimestamp() }) });
            window.hideLoading(); showToast("Request sent to host.", "success");
          }
        }
        roomId = codeVal; listenToRoom(roomId); showScreen(gameScreen); window.hideLoading();
      } catch (e) { window.hideLoading(); console.error(e); showToast("Connection Failed", "error"); }
    };
  }

  // --- CHAT LOGIC ---
  async function sendChatMessageForCurrentUser() {
    if (!roomId || !chatInputEl) return;
    let text = chatInputEl.value.trim();
    if (!text) return;
    if (text.length > CHAT_MAX_MESSAGE_LENGTH) text = text.slice(0, CHAT_MAX_MESSAGE_LENGTH);
    try {
      const uid = await requireAuth();
      const name = (currentUserData && currentUserData.username) || "Agent";
      const isVipUser = !!(currentUserData && currentUserData.inventory && currentUserData.inventory.includes("vip_pass"));
      const roomRef = db.collection("rmcs_rooms").doc(roomId);
      const snap = await roomRef.get();
      if (!snap.exists) return;
      const data = snap.data() || {};
      let chatArr = data.chat || [];
      const counts = data.chatMessageCounts || {};
      const myCount = counts[uid] || 0;
      const maxForUser = isVipUser ? CHAT_VIP_LIMIT : CHAT_FREE_LIMIT;
      if (myCount >= maxForUser) { showToast("Chat limit reached.", "error"); return; }
      
      const newMsg = { id: Date.now() + "_" + uid, uid, name, enc: encryptChatText(text), ts: firebase.firestore.FieldValue.serverTimestamp() };
      chatArr = chatArr.concat(newMsg);
      if (chatArr.length > CHAT_HISTORY_LIMIT) chatArr = chatArr.slice(chatArr.length - CHAT_HISTORY_LIMIT);
      
      await roomRef.update({ chat: chatArr, chatMessageCounts: { ...counts, [uid]: myCount + 1 } });
      chatInputEl.value = "";
    } catch (e) { showToast("Failed to send.", "error"); }
  }
  if (chatSendBtnEl && chatInputEl) {
    chatSendBtnEl.onclick = () => sendChatMessageForCurrentUser();
    chatInputEl.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessageForCurrentUser(); } });
  }

  // --- 8. GAME LOOP ---
  function listenToRoom(roomCode) {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    const roomRef = db.collection("rmcs_rooms").doc(roomCode);
    let lastPlayerCount = null;
    unsubscribe = roomRef.onSnapshot((docSnap) => {
      const data = docSnap.data();
      const authUser = firebase.auth().currentUser;
      if (!authUser) return;
      const selfId = authUser.uid;
      
      // Handle Room Closed / Kicked
      if (!data) {
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        postFeedbackAction = () => { showScreen(mainMenu); };
        pushTerminalMessage("Room terminated.", "warning");
        showFeedbackModal("room_closed");
        return;
      }
      const players = data.players || [];
      const pending = data.pendingJoins || [];
      lastPendingJoins = pending;
      const isInPlayers = players.some((p) => p.id === selfId);
      const isPending = pending.some((p) => p.id === selfId);

      if (!isInPlayers && !isPending) {
        showToast("You were removed from the room.", "error");
        showScreen(mainMenu);
        return;
      }

      if (currentRoomCode) currentRoomCode.innerText = roomCode;
      const isHost = selfId === data.host;
      if (roomPlayerCountEl) roomPlayerCountEl.textContent = players.length;

      // Host controls
      if (isHost) renderJoinRequestsPanel(pending, roomRef);
      else if (joinRequestsPanel) joinRequestsPanel.innerHTML = "";

      // UI v2.0: Cancel Room Button
      if (cancelRoomBtn) {
        cancelRoomBtn.style.display = isHost ? "block" : "none";
        cancelRoomBtn.onclick = () => {
          if (!isHost) return;
          confirmAction("ABORT MISSION?", "Terminate session for all operatives?", async () => {
             try { await roomRef.delete(); } catch(e){}
             if (unsubscribe) { unsubscribe(); unsubscribe = null; }
             postFeedbackAction = () => { showScreen(mainMenu); };
             showFeedbackModal("host_terminated");
          }, true);
        };
      }
      if (isHost) bindHostPlayerControls(roomRef);

      // Pending UI
      if (isPending && !isInPlayers) {
        if (gameContent) gameContent.style.display = "flex";
        gameContent.innerHTML = `<div class="flex flex-col items-center"><div class="text-5xl mb-3 animate-pulse">⏳</div><h3 class="font-cyber text-neon-blue">AWAITING APPROVAL</h3></div>`;
        return;
      }

      // Render Chat & Phase
      renderChatLog(data.chat || [], selfId, data.chatMessageCounts || {});
      lastPhase = data.phase;

      if (data.phase === "lobby") {
        if (gameContent) gameContent.style.display = "none";
        renderAvatarsTable(players, selfId, data.host);
        renderPlayersList(players, data.host, selfId, isHost, data.muted);
        renderScoreboard(data.scores || {}, players);
        
        if (startGameBtn) {
          startGameBtn.style.display = "flex";
          const canStart = isHost && players.length >= MIN_PLAYERS;
          startGameBtn.disabled = !canStart;
          startGameBtn.innerText = canStart ? "INITIATE SEQUENCE" : `WAITING (${players.length}/${MIN_PLAYERS})`;
          startGameBtn.onclick = () => {
            if (!canStart) return;
            // Role assignment logic
            const baseRoles = ["Raja", "Mantri", "Chor", "Sipahi"];
            const extraCount = Math.max(0, players.length - baseRoles.length);
            const extraRoles = Array.from({ length: extraCount }, () => "Civilian");
            const roles = [...baseRoles, ...extraRoles].sort(() => Math.random() - 0.5);
            const pr = players.map((p, i) => ({ id: p.id, name: p.name, role: roles[i] }));
            roomRef.update({ phase: "reveal", playerRoles: pr, revealed: [], guess: null, scoreUpdated: false });
          };
        }
      } else {
        if (gameContent) gameContent.style.display = "flex";
        renderPlayersList(players, data.host, selfId, isHost, data.muted);
        renderScoreboard(data.scores || {}, players);
        if (startGameBtn) startGameBtn.style.display = "none";
        
        if (data.phase === "reveal") showRoleRevealScreen(data, selfId, roomRef);
        else if (data.phase === "guess") showSipahiGuessUI(data, selfId, roomRef);
        else if (data.phase === "roundResult") showRoundResult(data, selfId, roomRef, isHost);
      }
    });
  }

  // --- 9. GAME HELPERS ---
  function getRoleIcon(role) {
    if (role === "Raja") return "👑";
    if (role === "Mantri") return "🧠";
    if (role === "Sipahi") return "🛡️";
    if (role === "Chor") return "🔪";
    return "👤";
  }

  // UPDATED SCORING: 8-Player Multiplier
  function calculateRoundPoints(players, isCorrect) {
    const playerCount = players.length;
    const multiplier = (playerCount >= 8) ? 2 : 1;
    const POINTS = { RAJA: 1000, MANTRI: 800, SIPAHI_WIN: 500, SIPAHI_LOSS: 0, CHOR_WIN: 500, CHOR_LOSS: 0 };
    let roundScores = {};
    players.forEach(p => {
        let score = 0;
        if (p.role === 'Raja') score = POINTS.RAJA;
        else if (p.role === 'Mantri') score = POINTS.MANTRI;
        else if (p.role === 'Sipahi') score = isCorrect ? POINTS.SIPAHI_WIN : POINTS.SIPAHI_LOSS;
        else if (p.role === 'Chor') score = isCorrect ? POINTS.CHOR_LOSS : POINTS.CHOR_WIN;
        else score = 100; // Civilians
        roundScores[p.id] = score * multiplier;
    });
    return roundScores;
  }

  function awardProgress(pointMap, isCorrect) {
    Object.keys(pointMap).forEach((uid) => {
      const pts = pointMap[uid] || 0;
      if (pts <= 0) return;
      const xpGain = Math.max(5, Math.round(pts / 10));
      const coinGain = isCorrect ? 10 : 4;
      db.collection("users").doc(uid).set({ 
          xp: firebase.firestore.FieldValue.increment(xpGain),
          seasonXp: firebase.firestore.FieldValue.increment(xpGain),
          coins: firebase.firestore.FieldValue.increment(coinGain) 
      }, { merge: true });
    });
  }

  // --- RENDERERS ---
  function showRoleRevealScreen(data, selfId, roomRef) {
    const p = data.playerRoles.find((pr) => pr.id === selfId);
    const isRS = p.role === "Raja" || p.role === "Sipahi";
    const amIRevealed = (data.revealed || []).some((r) => r.id === selfId);
    
    // Host auto-advance if Raja & Sipahi are revealed
    if (data.host === selfId) {
      const rRev = (data.revealed || []).some(r => r.role === "Raja");
      const sRev = (data.revealed || []).some(r => r.role === "Sipahi");
      if (rRev && sRev) { roomRef.update({ phase: "guess", revealed: [] }); return; }
    }

    gameContent.innerHTML = `
      <div class="flex flex-col items-center w-full">
        <div class="text-6xl mb-4">${getRoleIcon(p.role)}</div>
        <h3 class="font-cyber text-3xl text-neon-blue mb-2">${p.role}</h3>
        ${isRS && !amIRevealed ? `<button id="revealRoleBtn" class="cyber-btn danger text-sm w-full max-w-[200px]">EXPOSE IDENTITY</button>` : !isRS ? `<div class="border border-gray-700 text-gray-500 px-4 py-2 text-xs rounded">Status: Covert</div>` : `<div class="text-neon-green text-sm font-bold border border-neon-green px-4 py-2 rounded">Identity Exposed</div>`}
        <div class="mt-6 w-full border-t border-gray-800 pt-4">
          <p class="text-[10px] text-gray-500 uppercase mb-2">Exposed Agents</p>
          <div class="flex justify-center gap-2 flex-wrap">
            ${(data.revealed||[]).map(r => `<div class="bg-gray-900 border border-gray-700 p-2 rounded text-xs"><span class="text-neon-blue font-bold">${r.name}</span> is ${getRoleIcon(r.role)}</div>`).join("")}
          </div>
        </div>
      </div>`;
    
    if(document.getElementById("revealRoleBtn")) {
        document.getElementById("revealRoleBtn").onclick = () => {
            roomRef.update({ revealed: firebase.firestore.FieldValue.arrayUnion({ id: selfId, role: p.role, name: p.name }) });
        };
    }
  }

  function showSipahiGuessUI(data, selfId, roomRef) {
    const p = data.playerRoles.find((pr) => pr.id === selfId);
    if (p.role !== "Sipahi") {
      gameContent.innerHTML = `<div class="text-center"><div class="text-6xl mb-4 animate-bounce">🛡️</div><h3 class="text-neon-blue">SIPAHI IS ANALYZING...</h3></div>`;
      return;
    }
    const targets = data.playerRoles.filter((pr) => pr.role !== "Raja" && pr.role !== "Sipahi");
    gameContent.innerHTML = `
      <div class="flex flex-col items-center w-full max-w-sm">
        <h3 class="font-cyber text-white mb-6 bg-red-900/20 border border-red-500/30 px-4 py-1 rounded">Identify the Chor</h3>
        <div class="grid grid-cols-1 gap-3 w-full">
          ${targets.map(t => `<button class="guess-btn cyber-btn w-full py-4 text-lg" data-id="${t.id}">${t.name}</button>`).join("")}
        </div>
      </div>`;
    document.querySelectorAll(".guess-btn").forEach((btn) => {
      btn.onclick = () => {
        const t = targets.find((tg) => tg.id === btn.dataset.id);
        roomRef.update({ phase: "roundResult", guess: { sipahiId: p.id, guessedId: t.id, correct: t.role === "Chor", guessedName: t.name }, scoreUpdated: false });
      };
    });
  }

  function showRoundResult(data, selfId, roomRef, isHost) {
    const res = data.guess;
    if (!res) return;
    const isCorrect = res.correct;
    if (!data.scoreUpdated) { isCorrect ? playSound("caught") : playSound("escaped"); }

    if (isHost && !data.scoreUpdated) {
        const pts = calculateRoundPoints(data.playerRoles, isCorrect);
        const newScores = { ...(data.scores || {}) };
        Object.keys(pts).forEach(uid => newScores[uid] = (newScores[uid] || 0) + pts[uid]);
        roomRef.update({
            scores: newScores, scoreUpdated: true,
            history: firebase.firestore.FieldValue.arrayUnion({ result: isCorrect ? "Caught" : "Escaped", timestamp: firebase.firestore.FieldValue.serverTimestamp(), roles: data.playerRoles.map(p => ({ id: p.id, name: p.name, role: p.role, points: pts[p.id] || 0 })) })
        });
        awardProgress(pts, isCorrect);
    }
    const resultText = isCorrect ? "TARGET NEUTRALIZED" : "MISSION FAILED";
    const resultColor = isCorrect ? "text-neon-green" : "text-red-500";
    
    // Only show result summary, then Restart Button for host
    gameContent.innerHTML = `
      <div class="flex flex-col items-center w-full max-w-sm">
        <div class="text-6xl mb-2">${isCorrect ? "🎯" : "🤡"}</div>
        <h2 class="font-cyber text-2xl ${resultColor} mb-6 border-b border-gray-700 pb-2 w-full text-center">${resultText}</h2>
        ${isHost ? `<button id="rebootBtn" class="cyber-btn w-full py-3">REBOOT SYSTEM</button>` : `<div class="text-xs text-gray-500 animate-pulse">WAITING FOR HOST...</div>`}
      </div>`;
      
    if (isHost && document.getElementById("rebootBtn")) {
        document.getElementById("rebootBtn").onclick = async () => {
             // Shuffle roles and restart
             const baseRoles = ["Raja", "Mantri", "Chor", "Sipahi"];
             const extraCount = Math.max(0, data.playerRoles.length - baseRoles.length);
             const extraRoles = Array.from({ length: extraCount }, () => "Civilian");
             const roles = [...baseRoles, ...extraRoles].sort(() => Math.random() - 0.5);
             const pr = data.playerRoles.map((p, i) => ({ id: p.id, name: p.name, role: roles[i] }));
             await roomRef.update({ phase: "reveal", playerRoles: pr, revealed: [], guess: null, scoreUpdated: false });
        };
    }
  }

  // --- UI v2.0: HISTORY MODAL ---
  if (openHistoryBtn) {
    openHistoryBtn.onclick = () => {
        if (!roomId) return showToast("No active room log.", "error");
        const modalContent = `
          <div id="roomHistoryWrapper" class="mb-6 text-xs text-gray-200"><div class="text-gray-400 text-sm font-mono">Loading mission history...</div></div>
          <div class="flex justify-center mb-4"><button id="showGlobalBtn" class="px-4 py-2 text-[10px] border border-neon-blue rounded hover:bg-neon-blue/10 transition">VIEW GLOBAL RANKING</button></div>
          <div id="globalRankingWrapper" class="mt-2 text-xs text-gray-200 hidden"></div>
        `;
        window.showCustomModal("MISSION ARCHIVES", modalContent);
        loadRoomHistory(roomId);
        
        // Bind the dynamic button inside the modal
        setTimeout(() => {
            const showGlobalBtn = document.getElementById("showGlobalBtn");
            const globalWrapper = document.getElementById("globalRankingWrapper");
            if (showGlobalBtn) {
                showGlobalBtn.onclick = () => {
                    const isHidden = globalWrapper.classList.contains("hidden");
                    if (isHidden) {
                        globalWrapper.classList.remove("hidden"); showGlobalBtn.textContent = "HIDE RANKING";
                        if (!globalWrapper.hasChildNodes()) loadGlobalRanking(globalWrapper);
                    } else {
                        globalWrapper.classList.add("hidden"); showGlobalBtn.textContent = "VIEW RANKING";
                    }
                };
            }
        }, 100);
    };
  }

  // --- HOST CONTROLS (ConfirmAction) ---
  function bindHostPlayerControls(roomRef) {
    document.querySelectorAll("[data-kick-id]").forEach(btn => {
        btn.onclick = () => {
            const id = btn.getAttribute("data-kick-id");
            confirmAction("KICK AGENT?", "Remove this operative?", () => {
                roomRef.get().then(snap => {
                    const data = snap.data();
                    roomRef.update({ players: data.players.filter(p=>p.id!==id), [`scores.${id}`]: firebase.firestore.FieldValue.delete() });
                });
            }, true);
        };
    });
  }

  // --- HELPERS (Loaders) ---
  // (Keeping loadRoomHistory, loadGlobalRanking, renderPlayersList, renderScoreboard, renderAvatarsTable, renderChatLog... assuming they are standard)
  async function loadRoomHistory(roomCode) { /* ... (Same logic as provided, just ensure it targets #roomHistoryWrapper) ... */ }
  async function loadGlobalRanking(targetEl) { /* ... (Same logic as provided) ... */ }
  function renderPlayersList(players, hostId, selfId, isSelfHost, mutedIds) { /* ... (Same logic as provided) ... */ }
  function renderScoreboard(scores, players) { /* ... (Same logic as provided) ... */ }
  function renderAvatarsTable(players, selfId, hostId) { /* ... (Same logic as provided) ... */ }
  function renderChatLog(chatArr, selfId, countsMap) { /* ... (Same logic as provided) ... */ }
  function renderJoinRequestsPanel(pending, roomRef) { /* ... (Same logic as provided) ... */ }

  // Auto-join
  (function autoJoinFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const autoRoom = params.get("room");
    if (!autoRoom) return;
    showScreen(joinScreen);
    const joinCodeInput = getEl("joinRoomCode");
    if (joinCodeInput) joinCodeInput.value = autoRoom;
  })();

  startLobbyBrowser();
});
