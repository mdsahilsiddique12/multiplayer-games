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
  const MAX_PLAYERS = 8; // you can increase to 10 later

  // NEW: keep track of pending join requests locally (for host)
  let lastPendingJoins = [];

  // --- CHAT CONSTANTS (LIMITS + ENCRYPTION) ---
  const CHAT_HISTORY_LIMIT = 150;          // max messages stored per room
  const CHAT_FREE_LIMIT = 80;              // per-player quota (non-VIP)
  const CHAT_VIP_LIMIT = 220;              // per-player quota (VIP)
  const CHAT_MAX_MESSAGE_LENGTH = 240;     // per message length cap
  const CHAT_SECRET = "rmcs_v1_chat_key";  // lightweight XOR key (same on all clients)

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
  const historyModal = getEl("historyModal");
  const historyContent = getEl("historyContent");
  const openHistoryBtn = getEl("openHistoryBtn");
  const closeHistoryBtn = getEl("closeHistoryBtn");
  const feedbackModal = getEl("feedbackModal");
  const submitFeedbackBtn = getEl("submitFeedbackBtn");
  const skipFeedbackBtn = getEl("skipFeedbackBtn");
  const feedbackName = getEl("feedbackName");
  const feedbackText = getEl("feedbackText");
  const publicLobbiesList = getEl("publicLobbiesList");

  // NEW: create‑room options + host join‑request panel
  const roomVisibilitySelect = getEl("roomVisibility");      // <select> (optional)
  const waitingRoomToggle = getEl("waitingRoomToggle");      // <input type="checkbox"> (optional)
  const requireApprovalCheckbox = getEl("requireApprovalCheckbox"); // actual checkbox from HTML
  const joinRequestsPanel = getEl("joinRequestsPanel");      // host’s “Allow / Deny” list

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
    host: `
      color:#FFD700;
      border:1px solid #FFD700;
      text-shadow:0 0 12px rgba(255,215,0,0.8);
      font-weight:bold;
    `,
    vip: `
      background:linear-gradient(90deg,#00E4FF,#FF00FF);
      -webkit-background-clip:text;
      color:transparent;
      border:1px solid rgba(255,0,255,0.4);
      text-shadow:0 0 10px rgba(0,255,255,0.5);
    `,
    normal: `
      color:#4EF3FF;
      border:1px solid #4EF3FF;
      text-shadow:0 0 6px rgba(78,243,255,0.5);
    `
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
      console.error("decryptChatText failed", e);
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
    const hasMemePack =
      currentUserData &&
      currentUserData.inventory &&
      currentUserData.inventory.includes("meme_pack");
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
        coins: 100,
        xp: 0,
        seasonXp: 0,
        inventory: [],
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
    const hh = now.getHours().toString().padStart(2, "0");
    const mm = now.getMinutes().toString().padStart(2, "0");
    const stamp = `${hh}:${mm}`;
    let colorClass = "text-neon-blue";
    if (tone === "hint") colorClass = "text-cyan-300";
    if (tone === "warning") colorClass = "text-red-400";
    if (tone === "success") colorClass = "text-neon-green";
    const line = document.createElement("div");
    line.className = "border border-gray-800 rounded px-2 py-1 bg-black/40";
    line.innerHTML = `
      <span class="text-gray-500 mr-1">[${stamp}]</span>
      <span class="${colorClass} font-bold">GM:</span>
      <span class="text-gray-300 ml-1">${message}</span>
    `;
    box.prepend(line);
    while (box.children.length > 25) {
      box.removeChild(box.lastChild);
    }
  }

  // --- 5. IN‑GAME SHOP / BLACK MARKET ---
  const STORE_ITEMS = [
    {
      id: "robot_avatar",
      name: "Robot Avatar",
      type: "avatars",
      price: 200,
      requiresVip: false,
      emoji: "🤖",
      desc: "Synthetic operative shell."
    },
    {
      id: "alien_avatar",
      name: "Alien Avatar",
      type: "avatars",
      price: 250,
      requiresVip: true,
      emoji: "👽",
      desc: "Classified extra‑terrestrial identity."
    },
    {
      id: "gold_name",
      name: "Gold Nameplate",
      type: "colors",
      price: 300,
      requiresVip: true,
      emoji: "🏅",
      desc: "Mark yourself as high‑value asset."
    },
    {
      id: "cyan_name",
      name: "Neon Cyan Tag",
      type: "colors",
      price: 120,
      requiresVip: false,
      emoji: "💠",
      desc: "Clean cyber aesthetic."
    },
    {
      id: "meme_pack",
      name: "Meme Sound Pack",
      type: "sounds",
      price: 180,
      requiresVip: false,
      emoji: "😂",
      desc: "Sabash / Failure / Drum Roll pack."
    },
    {
      id: "vip_pass",
      name: "VIP Protocol Access",
      type: "colors",
      price: 500,
      requiresVip: false,
      emoji: "⭐",
      desc: "Unlock VIP skins & cosmetics."
    }
  ];
  function ownsItem(id) {
    return (
      currentUserData &&
      Array.isArray(currentUserData.inventory) &&
      currentUserData.inventory.includes(id)
    );
  }
  function userHasVip() {
    return ownsItem("vip_pass");
  }
  function renderStore(category = "avatars") {
    if (!storeGrid) return;
    if (!currentUserData) refreshUserCoinsUI();
    const filtered = STORE_ITEMS.filter((item) => item.type === category);
    if (filtered.length === 0) {
      storeGrid.innerHTML =
        '<div class="text-sm text-gray-400 font-mono">No items in this category yet.</div>';
      return;
    }
    storeGrid.innerHTML = filtered
      .map((item) => {
        const owned = ownsItem(item.id);
        const needsVip = item.requiresVip && !userHasVip();
        const canAfford =
          currentUserData && currentUserData.coins >= item.price && !needsVip && !owned;
        return `
          <div class="border border-gray-800 rounded-lg bg-black/50 p-3 flex flex-col justify-between text-xs font-mono">
            <div>
              <div class="flex items-center justify-between mb-1">
                <span class="text-lg">${item.emoji}</span>
                ${
                  item.requiresVip
                    ? '<span class="text-[9px] text-yellow-400 uppercase tracking-[0.2em]">VIP</span>'
                    : ""
                }
              </div>
              <div class="font-bold text-white mb-1">${item.name}</div>
              <div class="text-gray-400 text-[11px] mb-2">${item.desc}</div>
            </div>
            <div class="flex items-center justify-between mt-2">
              <span class="text-yellow-400 text-[11px]">💰 ${item.price}</span>
              ${
                owned
                  ? '<span class="text-[10px] text-neon-green uppercase tracking-[0.2em]">OWNED</span>'
                  : needsVip
                  ? '<span class="text-[10px] text-red-400 uppercase tracking-[0.2em]">NEED VIP PASS</span>'
                  : `<button
                       class="px-2 py-1 text-[10px] uppercase tracking-[0.2em] border border-neon-blue rounded hover:bg-neon-blue/20 transition buy-item-btn"
                       data-item-id="${item.id}"
                     >
                       BUY
                     </button>`
              }
            </div>
          </div>
        `;
      })
      .join("");
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
    if (!currentUserData) {
      alert("Login error. Please re‑load.");
      return;
    }
    if (ownsItem(item.id)) {
      alert("Already acquired.");
      return;
    }
    if (item.requiresVip && !userHasVip()) {
      alert("Requires VIP PASS. Buy VIP Protocol Access first.");
      return;
    }
    const coins = currentUserData.coins ?? 0;
    if (coins < item.price) {
      alert("Insufficient credits.");
      return;
    }
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
      alert("Purchase successful.");
    } catch (e) {
      console.error(e);
      alert("Purchase failed.");
    }
  }

  // Expose filterStore globally for HTML onclick
  window.filterStore = function (category) {
    const tabs = document.querySelectorAll(".store-tab");
    tabs.forEach((tab) => {
      if (tab.textContent.toLowerCase().includes(category.slice(0, 3))) {
        tab.classList.add("text-white");
        tab.classList.remove("text-gray-500");
      } else {
        tab.classList.remove("text-white");
        tab.classList.add("text-gray-500");
      }
    });
    renderStore(category);
  };

  // --- PUBLIC LOBBY BROWSER ---
  function startLobbyBrowser() {
    if (!publicLobbiesList) return;
    if (unsubscribeLobbyList) {
      unsubscribeLobbyList();
      unsubscribeLobbyList = null;
    }
    const q = db.collection("rmcs_rooms")
      .where("phase", "==", "lobby")
      .where("visibility", "==", "public");
    unsubscribeLobbyList = q.onSnapshot((snap) => {
      if (snap.empty) {
        publicLobbiesList.innerHTML = `
          <div class="text-gray-500 italic">
            No public rooms online. Spin up a new one!
          </div>`;
        return;
      }
      const rooms = snap.docs
        .map((doc) => {
          const d = doc.data();
          const players = (d.players || []).length;
          const max = (typeof d.maxPlayers === "number") ? d.maxPlayers : 8;
          const hostName = (d.players && d.players[0] && d.players[0].name) || "Host";
          return {
            code: doc.id,
            players,
            max,
            hostName,
            created: d.created ? d.created.toDate() : null
          };
        })
        .sort((a, b) => (b.created?.getTime() || 0) - (a.created?.getTime() || 0));
      publicLobbiesList.innerHTML = rooms.map((r) => `
        <div class="border border-gray-800 rounded bg-black/40 px-3 py-2 flex items-center justify-between">
          <div>
            <div class="text-gray-100">
              <span class="text-neon-blue font-bold tracking-[0.2em]">${r.code}</span>
            </div>
            <div class="text-[10px] text-gray-400 mt-0.5">
              Host: <span class="text-gray-200">${r.hostName}</span> · 
              ${r.players}/${r.max} operatives
            </div>
          </div>
          <button
            class="px-2 py-1 text-[10px] uppercase tracking-[0.2em] border border-neon-blue rounded hover:bg-neon-blue/20 transition join-public-btn"
            data-room-code="${r.code}">
              Join
          </button>
        </div>
      `).join("");
    });
  }
  if (publicLobbiesList) {
    publicLobbiesList.addEventListener("click", (e) => {
      const btn = e.target.closest(".join-public-btn");
      if (!btn) return;
      const code = btn.getAttribute("data-room-code");
      if (!code) return;
      showScreen(joinScreen);
      const joinCodeInput = getEl("joinRoomCode");
      if (joinCodeInput) joinCodeInput.value = code;
    });
  }

  // --- 6. NAVIGATION / SCREEN SWITCHING ---
  function showScreen(screen) {
    [mainMenu, createScreen, joinScreen, gameScreen, storeScreen].forEach((s) => {
      if (s) {
        s.classList.remove("active-screen");
        s.style.display = "none";
      }
    });
    if (screen) {
      screen.style.display = "block";
      screen.classList.add("active-screen");
    }
  }
  document.querySelectorAll(".create-btn").forEach(
    (b) =>
      (b.onclick = () => {
        showScreen(createScreen);
      })
  );
  document.querySelectorAll(".join-btn").forEach(
    (b) =>
      (b.onclick = () => {
        showScreen(joinScreen);
      })
  );
  document.querySelectorAll(".back-btn").forEach(
    (b) =>
      (b.onclick = () => {
        showScreen(mainMenu);
      })
  );
  if (openStoreBtn && storeScreen) {
    openStoreBtn.onclick = () => {
      showScreen(storeScreen);
      refreshUserCoinsUI();
      window.filterStore("avatars");
    };
  }
  if (copyCodeBtn) {
    copyCodeBtn.onclick = () => {
      const code = currentRoomCode ? currentRoomCode.innerText.trim() : "";
      if (!code) return alert("Room code not ready yet.");
      navigator.clipboard
        .writeText(code)
        .then(() => alert("Room code copied!"))
        .catch(() => alert("Copy failed, please copy manually."));
    };
  }
  if (copyLinkBtn) {
    copyLinkBtn.onclick = () => {
      const code = currentRoomCode ? currentRoomCode.innerText.trim() : "";
      if (!code) return alert("Room code not ready yet.");
      const link = `${window.location.origin}${window.location.pathname}?room=${code}`;
      navigator.clipboard
        .writeText(link)
        .then(() => alert("Invite link copied!"))
        .catch(() => alert("Copy failed, please copy manually."));
    };
  }
  const exitLobbyBtn = getEl("exitLobbyBtn");
  if (exitLobbyBtn) {
    exitLobbyBtn.onclick = async () => {
      await leaveCurrentRoom();
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      postFeedbackAction = () => {
        showScreen(mainMenu);
      };
      openFeedback("manual_disconnect");
    };
  }

  // --- FEEDBACK HELPERS ---
  function getStarValue(group) {
    const checked = document.querySelector(`input[name="${group}"]:checked`);
    return checked ? Number(checked.value) : null;
  }
  function openFeedback(reason) {
    console.log("Opening feedback for reason:", reason);
    if (!feedbackModal) {
      if (typeof postFeedbackAction === "function") {
        postFeedbackAction();
        postFeedbackAction = null;
      }
      return;
    }
    feedbackModal.classList.remove("hidden");
    feedbackModal.style.display = "flex";
  }
  function closeFeedback() {
    if (!feedbackModal) return;
    feedbackModal.style.display = "none";
    feedbackModal.classList.add("hidden");
    if (typeof postFeedbackAction === "function") {
      postFeedbackAction();
      postFeedbackAction = null;
    }
  }
  if (submitFeedbackBtn) {
    submitFeedbackBtn.onclick = async () => {
      const name = feedbackName ? feedbackName.value.trim() : "";
      const func = getStarValue("func");
      const over = getStarValue("over");
      const gui = getStarValue("gui");
      const text = feedbackText ? feedbackText.value.trim() : "";
      try {
        if (db && roomId) {
          await db.collection("rmcs_feedback").add({
            roomId,
            name: name || (currentUserData && currentUserData.username) || "Unknown Agent",
            ratingFunc: func,
            ratingOverall: over,
            ratingGui: gui,
            text,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      } catch (e) {
        console.error("Feedback save failed", e);
      }
      closeFeedback();
    };
  }
  if (skipFeedbackBtn) {
    skipFeedbackBtn.onclick = () => {
      closeFeedback();
    };
  }

  // --- 7. CREATE / JOIN LOGIC ---
  const createRoomFinal = getEl("createRoomFinal");
  if (createRoomFinal) {
    createRoomFinal.onclick = async () => {
      const nameVal = getEl("createPlayerName").value.trim();
      const codeVal =
        getEl("createRoomCode").value.trim().toUpperCase() ||
        Math.random().toString(36).substring(2, 6).toUpperCase();
      if (!nameVal) return alert("Agent Name Required");
      try {
        const uid = await requireAuth();
        const ref = db.collection("rmcs_rooms").doc(codeVal);
        if ((await ref.get()).exists)
          return alert("Frequency Occupied (Code Taken)");
        const isVip =
          currentUserData &&
          currentUserData.inventory &&
          currentUserData.inventory.includes("vip_pass");
        const playerData = {
          id: uid,
          name: nameVal,
          inventory: currentUserData?.inventory || [],
          isVip,
          nameColor: isVip ? "gold" : "white",
          roleType: "host"
        };

        // --- UPDATED ROOM VISIBILITY + WAITING ROOM (RADIO + FALLBACK) ---
        const visibility = (() => {
          const radio = document.querySelector('input[name="roomVisibility"]:checked');
          if (radio && radio.value === "personal") return "personal";
          if (roomVisibilitySelect && roomVisibilitySelect.value === "personal") return "personal";
          return "public";
        })();
        const waitingRoomEnabled =
          visibility === "personal" &&
          (
            (waitingRoomToggle && waitingRoomToggle.checked) ||
            (requireApprovalCheckbox && requireApprovalCheckbox.checked)
          );

        await ref.set({
          host: uid,
          players: [playerData],
          phase: "lobby",
          scores: { [uid]: 0 },
          muted: [],
          history: [],
          created: firebase.firestore.FieldValue.serverTimestamp(),
          maxPlayers: MAX_PLAYERS,
          visibility,           // "public" | "personal"
          waitingRoomEnabled,   // bool
          pendingJoins: [],     // NEW
          chat: [],             // NEW: encrypted chat array
          chatMessageCounts: {} // NEW: per-player message counts
        });
        roomId = codeVal;
        listenToRoom(roomId);
        showScreen(gameScreen);
      } catch (e) {
        console.error(e);
        alert("Deploy Failed");
      }
    };
  }

  const joinRoomFinal = getEl("joinRoomFinal");
  if (joinRoomFinal) {
    joinRoomFinal.onclick = async () => {
      const nameVal = getEl("joinPlayerName").value.trim();
      const codeVal = getEl("joinRoomCode").value.trim().toUpperCase();
      if (!nameVal || !codeVal) return alert("Credentials Missing");
      try {
        const uid = await requireAuth();
        const ref = db.collection("rmcs_rooms").doc(codeVal);
        const snap = await ref.get();
        if (!snap.exists) return alert("Signal Lost (Room Not Found)");
        const data = snap.data();
        const isVip =
          currentUserData &&
          currentUserData.inventory &&
          currentUserData.inventory.includes("vip_pass");
        const roleType =
          uid === data.host ? "host" : isVip ? "vip" : "normal";
        const playerData = {
          id: uid,
          name: nameVal,
          inventory: currentUserData?.inventory || [],
          isVip,
          nameColor: isVip ? "gold" : "white",
          roleType
        };
        const players = data.players || [];
        const pending = data.pendingJoins || [];
        const alreadyPlayer = players.some((p) => p.id === uid);
        const alreadyPending = pending.some((p) => p.id === uid);
        if (!alreadyPlayer && players.length >= MAX_PLAYERS) {
          return alert(`Squad Full (${players.length}/${MAX_PLAYERS})`);
        }
        const visibility = data.visibility || "public";
        const waitingRoomEnabled = !!data.waitingRoomEnabled;
        if (!alreadyPlayer && !alreadyPending) {
          if (visibility === "public" && !waitingRoomEnabled) {
            await ref.update({
              players: firebase.firestore.FieldValue.arrayUnion(playerData),
              [`scores.${uid}`]: 0
            });
          } else {
            const pendingPlayer = {
              ...playerData,
              requestedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await ref.update({
              pendingJoins: firebase.firestore.FieldValue.arrayUnion(pendingPlayer)
            });
            alert("Join request sent. Waiting for host approval.");
          }
        }
        roomId = codeVal;
        listenToRoom(roomId);
        showScreen(gameScreen);
      } catch (e) {
        console.error(e);
        alert("Connection Failed");
      }
    };
  }

  // --- CHAT SENDER (USES ENCRYPTION + LIMITS) ---
  async function sendChatMessageForCurrentUser() {
    if (!roomId) {
      alert("No active room.");
      return;
    }
    if (!chatInputEl) return;
    let text = chatInputEl.value.trim();
    if (!text) return;
    if (text.length > CHAT_MAX_MESSAGE_LENGTH) {
      text = text.slice(0, CHAT_MAX_MESSAGE_LENGTH);
    }
    try {
      const uid = await requireAuth();
      const name =
        (currentUserData && currentUserData.username) ||
        (currentUserData && currentUserData.displayName) ||
        "Agent";
      const isVipUser = !!(currentUserData &&
        Array.isArray(currentUserData.inventory) &&
        currentUserData.inventory.includes("vip_pass"));
      const roomRef = db.collection("rmcs_rooms").doc(roomId);
      const snap = await roomRef.get();
      if (!snap.exists) {
        alert("Room not found.");
        return;
      }
      const data = snap.data() || {};
      let chatArr = data.chat || [];
      const counts = data.chatMessageCounts || {};
      const myCount = counts[uid] || 0;
      const maxForUser = isVipUser ? CHAT_VIP_LIMIT : CHAT_FREE_LIMIT;
      if (myCount >= maxForUser) {
        alert(
          "You reached the chat limit for this match.\nVIP operatives get extended chat capacity."
        );
        return;
      }
      const encText = encryptChatText(text);
      const msgId = Date.now().toString() + "_" + uid;
      const newMsg = {
        id: msgId,
        uid,
        name,
        enc: encText,
        ts: firebase.firestore.FieldValue.serverTimestamp()
      };
      chatArr = chatArr.concat(newMsg);
      if (chatArr.length > CHAT_HISTORY_LIMIT) {
        chatArr = chatArr.slice(chatArr.length - CHAT_HISTORY_LIMIT);
      }
      const newCounts = { ...counts, [uid]: myCount + 1 };
      await roomRef.update({
        chat: chatArr,
        chatMessageCounts: newCounts
      });
      chatInputEl.value = "";
    } catch (e) {
      console.error("sendChatMessageForCurrentUser failed", e);
      alert("Failed to send message.");
    }
  }

  // BIND CHAT INPUT / BUTTON ONCE
  if (chatSendBtnEl && chatInputEl) {
    chatSendBtnEl.onclick = () => {
      sendChatMessageForCurrentUser();
    };
    chatInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendChatMessageForCurrentUser();
      }
    });
  }

  // --- CHAT RENDERING (LIMITED HISTORY, DECRYPT ON CLIENT) ---
  let lastChatSignature = "";
  function renderChatLog(chatArr, selfId, countsMap) {
    if (!chatLogEl) return;
    chatArr = chatArr || [];
    const sig = chatArr.map((m) => m.id).join("|");
    if (sig === lastChatSignature) {
      return; // no changes
    }
    lastChatSignature = sig;

    const sorted = [...chatArr].sort((a, b) => {
      const ta = a.ts && a.ts.seconds ? a.ts.seconds : 0;
      const tb = b.ts && b.ts.seconds ? b.ts.seconds : 0;
      return ta - tb;
    });
    chatLogEl.innerHTML = sorted
      .map((m) => {
        const isSelf = m.uid === selfId;
        const text = decryptChatText(m.enc || "");
        const tsDate = m.ts && m.ts.toDate ? m.ts.toDate() : null;
        const timeStr = tsDate
          ? tsDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "--:--";
        return `
          <div class="flex items-start gap-2 ${isSelf ? "justify-end" : "justify-start"}">
            ${
              !isSelf
                ? `<span class="text-[9px] text-gray-500 mt-[2px]">${timeStr}</span>`
                : ""
            }
            <div class="px-2 py-1 rounded border border-gray-800 bg-black/60 max-w-[80%] ${
              isSelf ? "text-neon-blue border-neon-blue/60" : "text-gray-200"
            }">
              <div class="text-[9px] uppercase tracking-[0.18em] text-gray-400 mb-0.5">
                ${isSelf ? "YOU" : (m.name || "Agent")}
              </div>
              <div class="text-[11px] break-words">
                ${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
              </div>
            </div>
            ${
              isSelf
                ? `<span class="text-[9px] text-gray-500 mt-[2px]">${timeStr}</span>`
                : ""
            }
          </div>
        `;
      })
      .join("");

    chatLogEl.scrollTop = chatLogEl.scrollHeight;

    if (chatQuotaEl && firebase.auth().currentUser) {
      const selfId2 = firebase.auth().currentUser.uid;
      const cMap = countsMap || {};
      const myCount = cMap[selfId2] || 0;
      const isVipUser = !!(currentUserData &&
        Array.isArray(currentUserData.inventory) &&
        currentUserData.inventory.includes("vip_pass"));
      const maxForUser = isVipUser ? CHAT_VIP_LIMIT : CHAT_FREE_LIMIT;
      chatQuotaEl.textContent = `Chat used: ${myCount}/${maxForUser}${
        isVipUser ? " (VIP)" : ""
      }`;
    }
  }

  // --- 8. GAME LOOP ---
  function listenToRoom(roomCode) {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    const roomRef = db.collection("rmcs_rooms").doc(roomCode);
    let lastPlayerCount = null;
    unsubscribe = roomRef.onSnapshot((docSnap) => {
      const data = docSnap.data();
      const authUser = firebase.auth().currentUser;
      if (!authUser) return;
      const selfId = authUser.uid;
      if (!data) {
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        postFeedbackAction = () => {
          showScreen(mainMenu);
        };
        pushTerminalMessage("Room was terminated by host. Debriefing...", "warning");
        openFeedback("room_closed");
        return;
      }
      const players = data.players || [];
      const pending = data.pendingJoins || [];
      lastPendingJoins = pending;
      const isInPlayers = players.some((p) => p.id === selfId);
      const isPending = pending.some((p) => p.id === selfId);

      // If you are neither player nor pending → kicked/denied
      if (!isInPlayers && !isPending) {
        alert("You are no longer in this room (kicked/denied or room reset).");
        pushTerminalMessage("You are no longer a member of this room.", "warning");
        showScreen(mainMenu);
        return;
      }

      if (currentRoomCode) currentRoomCode.innerText = roomCode;
      const isHost = selfId === data.host;
      const mutedArr = data.muted || [];

      if (roomPlayerCountEl) {
        roomPlayerCountEl.textContent = players.length;
      }

      if (lastPlayerCount === null) {
        pushTerminalMessage(
          `Connected to room ${roomCode}. ${players.length} operative(s) online.`,
          "system"
        );
      } else if (players.length !== lastPlayerCount) {
        const diff = players.length - lastPlayerCount;
        if (diff > 0) {
          pushTerminalMessage(`${Math.abs(diff)} new operative(s) joined the network.`, "system");
        } else {
          pushTerminalMessage(`${Math.abs(diff)} operative(s) disconnected.`, "system");
        }
      }
      lastPlayerCount = players.length;

      // HOST: show & handle join requests
      if (isHost) {
        renderJoinRequestsPanel(pending, roomRef);
      } else if (joinRequestsPanel) {
        joinRequestsPanel.innerHTML = "";
      }

      // Host can cancel room
      if (cancelRoomBtn) {
        cancelRoomBtn.style.display = isHost ? "block" : "none";
        cancelRoomBtn.onclick = async () => {
          if (!isHost) return;
          if (confirm("Abort mission for everyone?")) {
            try {
              await roomRef.delete();
            } catch (e) {
              console.error("Room delete failed", e);
            }
            if (unsubscribe) {
              unsubscribe();
              unsubscribe = null;
            }
            postFeedbackAction = () => {
              showScreen(mainMenu);
            };
            pushTerminalMessage("You terminated this mission. Debrief incoming.", "warning");
            openFeedback("host_terminated");
          }
        };
      }
      if (isHost) {
        bindHostPlayerControls(roomRef);
      }

      // Pending screen
      if (isPending && !isInPlayers) {
        if (gameContent) {
          gameContent.style.display = "flex";
          gameContent.innerHTML = `
            <div class="flex flex-col items-center w-full max-w-sm animate-fade-in">
              <div class="text-5xl mb-3 animate-pulse">⏳</div>
              <h3 class="font-cyber text-neon-blue text-xl tracking-widest mb-2">
                AWAITING HOST APPROVAL
              </h3>
              <p class="text-xs text-gray-400 font-mono text-center">
                Your request to join has been sent to the host.<br/>
                Please wait while they decide to allow or deny.
              </p>
            </div>
          `;
        }
        // Chat is disabled while pending; no rendering
        return;
      }

      // --- CHAT RENDERING FROM ROOM DOC ---
      renderChatLog(data.chat || [], selfId, data.chatMessageCounts || {});

      // Phase transitions
      if (data.phase !== lastPhase) {
        if (data.phase === "lobby") {
          pushTerminalMessage("Lobby phase. Waiting for enough operatives to begin.", "hint");
        }
        if (data.phase === "reveal") {
          playSound("reveal");
          pushTerminalMessage("Roles assigned. Raja & Sipahi: reveal at your discretion.", "hint");
          if (roundTransition) {
            roundTransition.classList.remove("hidden");
            roundTransition.style.display = "flex";
            setTimeout(() => {
              roundTransition.style.display = "none";
            }, 2500);
          }
        }
        if (data.phase === "guess") {
          pushTerminalMessage("Sipahi is now choosing the Chor. Stay silent.", "hint");
        }
        if (data.phase === "roundResult") {
          pushTerminalMessage("Round complete. Parsing results...", "system");
        }
      }
      lastPhase = data.phase;

      // Lobby vs Game UI
      if (data.phase === "lobby") {
        if (gameContent) gameContent.style.display = "none";
        renderAvatarsTable(players, selfId, data.host);
        renderPlayersList(players, data.host, selfId, isHost, mutedArr);
        renderScoreboard(data.scores || {}, players);
        if (startGameBtn) {
          startGameBtn.style.display = "flex";
          const playerCount = players.length;
          const canStart = isHost && playerCount >= MIN_PLAYERS;
          startGameBtn.disabled = !canStart;
          startGameBtn.innerText = canStart
            ? "INITIATE SEQUENCE"
            : `WAITING (${playerCount}/${MIN_PLAYERS})`;
          if (canStart && lastPhase === "lobby") {
            pushTerminalMessage("Minimum squad online. Host can initiate sequence.", "success");
          }
          startGameBtn.onclick = () => {
            if (!canStart) return;
            const baseRoles = ["Raja", "Mantri", "Chor", "Sipahi"];
            const extraCount = Math.max(0, playerCount - baseRoles.length);
            const extraRoles = Array.from(
              { length: extraCount },
              () => "Civilian"
            );
            const roles = [...baseRoles, ...extraRoles].sort(
              () => Math.random() - 0.5
            );
            const pr = players.map((p, i) => ({
              id: p.id,
              name: p.name,
              role: roles[i]
            }));
            roomRef.update({
              phase: "reveal",
              playerRoles: pr,
              revealed: [],
              guess: null,
              scoreUpdated: false
            });
          };
        }
      } else {
        if (gameContent) gameContent.style.display = "flex";
        renderPlayersList(players, data.host, selfId, isHost, mutedArr);
        renderScoreboard(data.scores || {}, players);
        if (startGameBtn) startGameBtn.style.display = "none";
        if (data.phase === "reveal")
          showRoleRevealScreen(data, selfId, roomRef);
        else if (data.phase === "guess")
          showSipahiGuessUI(data, selfId, roomRef);
        else if (data.phase === "roundResult")
          showRoundResult(data, selfId, roomRef, isHost);
      }
    });
  }

  // --- 9. RENDERERS / SCREENS ---
  function showRoleRevealScreen(data, selfId, roomRef) {
    const p = data.playerRoles.find((pr) => pr.id === selfId);
    if (!p) return;
    const isRS = p.role === "Raja" || p.role === "Sipahi";
    const revealed = data.revealed || [];
    const amIRevealed = revealed.some((r) => r.id === selfId);
    if (data.host === selfId) {
      const rRev = revealed.some((r) => r.role === "Raja");
      const sRev = revealed.some((r) => r.role === "Sipahi");
      if (rRev && sRev) {
        roomRef.update({ phase: "guess", revealed: [] });
        return;
      }
    }
    gameContent.innerHTML = `
      <div class="flex flex-col items-center animate-fade-in w-full">
        <div class="text-6xl mb-4 filter drop-shadow-[0_0_15px_rgba(0,243,255,0.5)]">
          ${getRoleIcon(p.role)}
        </div>
        <h3 class="font-cyber text-3xl text-neon-blue mb-2 tracking-[0.2em]">${p.role}</h3>
        <p class="text-gray-400 text-xs mb-6 font-mono">PROTOCOL: ${
          isRS ? "ACTIVE" : "PASSIVE"
        }</p>
        ${
          isRS && !amIRevealed
            ? `<button id="revealRoleBtn" class="cyber-btn danger text-sm w-full max-w-[200px]">EXPOSE IDENTITY</button>`
            : !isRS
            ? `<div class="border border-gray-700 text-gray-500 px-4 py-2 text-xs rounded uppercase tracking-widest">Status: Covert</div>`
            : `<div class="text-neon-green text-sm font-bold animate-pulse uppercase border border-neon-green px-4 py-2 rounded">Identity Exposed</div>`
        }
        <div class="mt-6 w-full border-t border-gray-800 pt-4">
          <p class="text-[10px] text-gray-500 uppercase mb-2">Exposed Agents</p>
          <div class="flex justify-center gap-2 flex-wrap">
            ${
              revealed.length
                ? revealed
                    .map(
                      (r) => `
                  <div class="bg-gray-900 border border-gray-700 p-2 rounded text-xs">
                    <span class="text-neon-blue font-bold">${r.name}</span>
                    <span class="text-gray-400"> is </span>
                    ${getRoleIcon(r.role)}
                  </div>
                `
                    )
                    .join("")
                : '<span class="text-gray-700 italic text-xs">None</span>'
            }
          </div>
        </div>
      </div>
    `;
    const btn = document.getElementById("revealRoleBtn");
    if (btn) {
      btn.onclick = () => {
        roomRef.update({
          revealed: firebase.firestore.FieldValue.arrayUnion({
            id: selfId,
            role: p.role,
            name: p.name
          })
        });
      };
    }
  }

  function showSipahiGuessUI(data, selfId, roomRef) {
    const p = data.playerRoles.find((pr) => pr.id === selfId);
    if (!p) return;
    if (p.role !== "Sipahi") {
      gameContent.innerHTML = `
        <div class="text-center animate-fade-in">
          <div class="text-6xl mb-4 animate-bounce">🛡️</div>
          <h3 class="text-neon-blue font-bold text-xl tracking-widest">SIPAHI IS ANALYZING...</h3>
          <p class="text-gray-500 text-xs mt-2">Maintain radio silence.</p>
        </div>
      `;
      return;
    }
    const targets = data.playerRoles.filter(
      (pr) => pr.role !== "Raja" && pr.role !== "Sipahi"
    );
    gameContent.innerHTML = `
      <div class="flex flex-col items-center w-full max-w-sm animate-fade-in">
        <h3 class="font-cyber text-white mb-6 text-sm bg-red-900/20 border border-red-500/30 px-4 py-1 rounded uppercase tracking-widest animate-pulse">
          Identify the Chor
        </h3>
        <div class="grid grid-cols-1 gap-3 w-full">
          ${targets
            .map(
              (t) =>
                `<button class="guess-btn cyber-btn w-full py-4 text-lg" data-id="${t.id}">
                  ${t.name}
                </button>`
            )
            .join("")}
        </div>
      </div>
    `;
    document.querySelectorAll(".guess-btn").forEach((btn) => {
      btn.onclick = () => {
        const t = targets.find((tg) => tg.id === btn.dataset.id);
        roomRef.update({
          phase: "roundResult",
          guess: {
            sipahiId: p.id,
            guessedId: t.id,
            correct: t.role === "Chor",
            guessedName: t.name
          },
          scoreUpdated: false
        });
      };
    });
  }

  function showRoundResult(data, selfId, roomRef, isHost) {
    const res = data.guess;
    if (!res) return;
  
    const isCorrect = res.correct;
  
    // Play sound once per round
    if (!data.scoreUpdated) {
      if (isCorrect) playSound("caught");
      else playSound("escaped");
    }
  
    // Host: update scores & history once
    if (isHost && !data.scoreUpdated) {
      const pts = calculateRoundPoints(data.playerRoles, isCorrect);
      const newScores = { ...(data.scores || {}) };
  
      Object.keys(pts).forEach((uid) => {
        newScores[uid] = (newScores[uid] || 0) + pts[uid];
      });
  
      const historyEntry = {
        result: isCorrect ? "Caught" : "Escaped",
        timestamp: new Date().toISOString()
      };
  
      roomRef.update({
        scores: newScores,
        history: firebase.firestore.FieldValue.arrayUnion(historyEntry),
        scoreUpdated: true
      });
  
      awardProgress(pts, isCorrect);
    }
  
    // Summary line for terminal
    const summary = isCorrect
      ? `Sipahi correctly identified the Chor. Security protocol successful.`
      : `Chor evaded detection. Security breach recorded.`;
  
    pushTerminalMessage(summary, isCorrect ? "success" : "warning");
  
    // 🔹 Use the *global* gameContent (DON'T redeclare it)
    if (!gameContent) return;
    gameContent.style.display = "flex";
    gameContent.innerHTML = `
      <div class="w-full max-w-md mx-auto text-center space-y-4">
        <h2 class="font-cyber text-2xl md:text-3xl text-neon-blue tracking-[0.25em] uppercase">
          Round Complete
        </h2>
        <p class="font-mono text-sm text-gray-300 leading-relaxed">
          ${summary}
        </p>
  
        <div class="mt-4 text-xs font-mono text-gray-400">
          Roles have been logged in the mission archive.
        </div>
  
        <div class="mt-6">
          ${
            isHost
              ? `<button id="rebootBtn"
                         class="cyber-btn w-full py-3 shadow-[0_0_20px_rgba(0,243,255,0.3)]">
                   REBOOT SYSTEM
                 </button>`
              : `<div class="text-xs text-gray-500 animate-pulse">
                   WAITING FOR HOST TO REBOOT…
                 </div>`
          }
        </div>
      </div>
    `;
  
    // If not host, stop here
    if (!isHost) return;
  
    // Host only: wire up REBOOT SYSTEM
    const rebootBtn = getEl("rebootBtn");
    if (!rebootBtn) {
      console.warn("Reboot button not found in DOM");
      return;
    }
  
    rebootBtn.addEventListener("click", async () => {
      try {
        rebootBtn.disabled = true;
        rebootBtn.innerText = "INITIALIZING…";
  
        const playerCount = data.playerRoles.length;
        const baseRoles = ["Raja", "Mantri", "Chor", "Sipahi"];
        const extraCount = Math.max(0, playerCount - baseRoles.length);
        const extraRoles = Array.from({ length: extraCount }, () => "Civilian");
        const roles = [...baseRoles, ...extraRoles].sort(
          () => Math.random() - 0.5
        );
  
        const newPlayerRoles = data.playerRoles.map((p, i) => ({
          id: p.id,
          name: p.name,
          role: roles[i]
        }));
  
        await roomRef.update({
          phase: "reveal",
          playerRoles: newPlayerRoles,
          revealed: [],
          guess: null,
          scoreUpdated: false
        });
  
        // Hide overlay if you want
        gameContent.style.display = "none";
      } catch (err) {
        console.error("Reboot failed:", err);
        rebootBtn.disabled = false;
        rebootBtn.innerText = "REBOOT SYSTEM";
        pushTerminalMessage(
          "Reboot failed. Check console / Firestore rules.",
          "warning"
        );
      }
    });
  }



  // --- 10. HOST CONTROL HELPERS (KICK / MUTE) ---
  function bindHostPlayerControls(roomRef) {
    const kickButtons = document.querySelectorAll("[data-kick-id]");
    const muteButtons = document.querySelectorAll("[data-mute-id]");
    kickButtons.forEach((btn) => {
      btn.onclick = () => {
        const targetId = btn.getAttribute("data-kick-id");
        if (!confirm("Remove this operative from the room?")) return;
        roomRef
          .get()
          .then((snap) => {
            const data = snap.data();
            const newPlayers = (data.players || []).filter(
              (p) => p.id !== targetId
            );
            const newScores = { ...(data.scores || {}) };
            delete newScores[targetId];
            const newMuted = (data.muted || []).filter(
              (id) => id !== targetId
            );
            const newPending = (data.pendingJoins || []).filter(
              (p) => p.id !== targetId
            );
            roomRef.update({
              players: newPlayers,
              scores: newScores,
              muted: newMuted,
              pendingJoins: newPending
            });
          })
          .catch(console.error);
      };
    });
    muteButtons.forEach((btn) => {
      btn.onclick = () => {
        const targetId = btn.getAttribute("data-mute-id");
        roomRef
          .get()
          .then((snap) => {
            const data = snap.data();
            const muted = data.muted || [];
            const isMuted = muted.includes(targetId);
            const newMuted = isMuted
              ? muted.filter((id) => id !== targetId)
              : muted.concat(targetId);
            roomRef.update({ muted: newMuted });
          })
          .catch(console.error);
      };
    });
  }

  // NEW: HOST JOIN‑REQUEST PANEL (Allow / Deny)
  function renderJoinRequestsPanel(pending, roomRef) {
    if (!joinRequestsPanel) return;
    if (!pending || pending.length === 0) {
      joinRequestsPanel.innerHTML = `
        <div class="text-[10px] text-gray-500 font-mono italic">
          No pending join requests.
        </div>`;
      return;
    }
    joinRequestsPanel.innerHTML = pending
      .map(
        (p) => `
        <div class="border border-gray-800 bg-black/40 rounded px-3 py-2 mb-2 text-xs flex items-center justify-between">
          <div>
            <div class="text-gray-100 font-mono">
              ${p.name}
            </div>
            <div class="text-[9px] text-gray-500">
              ID: ${p.id.substring(0, 6)}... · Waiting for approval
            </div>
          </div>
          <div class="flex gap-2">
            <button
              class="text-[9px] px-2 py-1 border border-neon-green rounded hover:bg-neon-green/20 approve-join-btn"
              data-player-id="${p.id}">
              ALLOW
            </button>
            <button
              class="text-[9px] px-2 py-1 border border-red-500 rounded hover:bg-red-500/20 deny-join-btn"
              data-player-id="${p.id}">
              DENY
            </button>
          </div>
        </div>
      `
      )
      .join("");
    joinRequestsPanel.onclick = (e) => {
      const approveBtn = e.target.closest(".approve-join-btn");
      const denyBtn = e.target.closest(".deny-join-btn");
      if (!approveBtn && !denyBtn) return;
      const targetId = (approveBtn || denyBtn).getAttribute("data-player-id");
      if (!targetId) return;
      const player = lastPendingJoins.find((p) => p.id === targetId);
      if (!player) return;
      if (approveBtn) {
        roomRef.update({
          players: firebase.firestore.FieldValue.arrayUnion(player),
          pendingJoins: firebase.firestore.FieldValue.arrayRemove(player),
          [`scores.${player.id}`]: 0
        }).catch(console.error);
      } else if (denyBtn) {
        roomRef.update({
          pendingJoins: firebase.firestore.FieldValue.arrayRemove(player)
        }).catch(console.error);
      }
    };
  }

  // --- 11. GLOBAL HELPERS & UI RENDERING ---
  function getRoleIcon(role) {
    if (role === "Raja") return "👑";
    if (role === "Mantri") return "🧠";
    if (role === "Sipahi") return "🛡️";
    if (role === "Chor") return "🔪";
    if (role === "Civilian") return "👤";
    return "❓";
  }
  function calculateRoundPoints(roles, isCorrect) {
    const pts = {};
    roles.forEach((p) => {
      if (p.role === "Raja") pts[p.id] = 1000;
      else if (p.role === "Mantri") pts[p.id] = 800;
      else if (p.role === "Sipahi") pts[p.id] = isCorrect ? 500 : 0;
      else if (p.role === "Chor") pts[p.id] = isCorrect ? 0 : 500;
      else if (p.role === "Civilian") pts[p.id] = 100;
    });
    return pts;
  }
  function awardProgress(pointMap, isCorrect) {
    Object.keys(pointMap).forEach((uid) => {
      const pts = pointMap[uid] || 0;
      if (pts <= 0) return;
      const xpGain = Math.max(5, Math.round(pts / 10));
      const coinGain = isCorrect ? 10 : 4;
      const userRef = db.collection("users").doc(uid);
      userRef
        .set(
          {
            xp: firebase.firestore.FieldValue.increment(xpGain),
            seasonXp: firebase.firestore.FieldValue.increment(xpGain),
            coins: firebase.firestore.FieldValue.increment(coinGain)
          },
          { merge: true }
        )
        .catch(console.error);
      const me = firebase.auth().currentUser;
      if (me && me.uid === uid && currentUserData) {
        currentUserData.xp += xpGain;
        currentUserData.seasonXp += xpGain;
        currentUserData.coins += coinGain;
        refreshUserCoinsUI();
      }
    });
  }
  function renderPlayersList(players, hostId, selfId, isSelfHost, mutedIds) {
    if (!playersListEl) return;
    if (!players || players.length === 0) {
      playersListEl.innerHTML = `
        <div class="text-[11px] text-gray-500 italic">
          Waiting for operatives to connect...
        </div>`;
      return;
    }
    const mutedSet = new Set(mutedIds || []);
    playersListEl.innerHTML = players
      .map((p) => {
        const isHost = p.id === hostId;
        const isVip = !!p.isVip;
        const isMuted = mutedSet.has(p.id);
        const isSelf = p.id === selfId;
        const tagText = isHost ? "HOST" : isVip ? "VIP" : "AGENT";
        const tagClass = isHost
          ? "text-neon-blue"
          : isVip
          ? "text-yellow-400"
          : "text-gray-500";
        const rightSide = isSelfHost && !isHost
          ? `
            <div class="flex gap-2 items-center">
              <button
                class="text-[9px] text-red-400 hover:text-red-200 font-bold tracking-[0.2em]"
                data-kick-id="${p.id}"
              >
                KICK
              </button>
              <button
                class="text-[9px] ${
                  isMuted ? "text-yellow-300" : "text-gray-400"
                } hover:text-yellow-200 tracking-[0.2em]"
                data-mute-id="${p.id}"
              >
                ${isMuted ? "UNMUTE" : "MUTE"}
              </button>
            </div>
          `
          : `<div class="text-[10px] text-gray-400">
               ● ${isMuted ? "MUTED" : "ONLINE"}
             </div>`;
        return `
          <div class="flex items-center justify-between px-3 py-2 border border-gray-800 rounded-lg bg-black/40 text-xs mb-1 w-full max-w-xs">
            <div class="flex items-center gap-2">
              <div class="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500/60 to-purple-500/60 flex items-center justify-center text-[11px]">
                ${p.name.charAt(0).toUpperCase()}
              </div>
              <div class="flex flex-col">
                <span class="font-mono" style="${getNameStyleForPlayer(
                  p,
                  hostId
                )}">
                  ${isSelf ? "[YOU] " : ""}${p.name}
                </span>
                <span class="text-[9px] ${tagClass} uppercase tracking-[0.2em]">
                  ${tagText}
                </span>
              </div>
            </div>
            ${rightSide}
          </div>
        `;
      })
      .join("");
  }
  function renderScoreboard(scores, players) {
    if (!scoreListEl || !scores) return;
    const sorted = players
      .map((p) => ({
        id: p.id,
        name: p.name,
        score: scores[p.id] || 0
      }))
      .sort((a, b) => b.score - a.score);
    scoreListEl.innerHTML = sorted
      .map(
        (p, i) => `
        <div class="flex justify-between items-center py-2 border-b border-gray-800/50">
          <span class="${
            i === 0 ? "text-neon-green font-bold" : "text-gray-400"
          }">
            ${i + 1}. ${p.name}
          </span>
          <span class="font-mono text-neon-pink">${p.score}</span>
        </div>
      `
      )
      .join("");
  }
  function renderAvatarsTable(players, selfId, hostId) {
    const table = document.querySelector(".game-table");
    if (!table) return;
    table.querySelectorAll(".avatar").forEach((e) => e.remove());
    const N = players.length;
    if (N === 0) return;
    const radius = 130;
    const cx = 160;
    const cy = 160;
    const selfIdx = players.findIndex((p) => p.id === selfId);
    players.forEach((p, i) => {
      const logicalIdx = (i - selfIdx + N) % N;
      const angle = Math.PI / 2 + (2 * Math.PI * logicalIdx) / N;
      const x = cx + radius * Math.cos(angle) - 35;
      const y = cy + radius * Math.sin(angle) - 35;
      const el = document.createElement("div");
      el.className = "avatar";
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
        <div class="avatar-name ${isSelf ? "avatar-name-self" : ""}">
          ${p.name}
        </div>
      `;
      if (isSelf) {
        el.style.borderColor = "#f97316";
        el.style.boxShadow = "0 0 20px rgba(249, 115, 22, 0.8)";
      }
      table.appendChild(el);
    });
  }

  // --- 12. HISTORY MODAL & GLOBAL LEADERBOARD ---
  // --- 12. HISTORY MODAL & GLOBAL LEADERBOARD ---
  
  // Open history modal: show ROOM HISTORY + button to toggle GLOBAL RANKING
  if (openHistoryBtn && historyModal && historyContent) {
    openHistoryBtn.onclick = () => {
      if (!roomId) {
        alert("No active room log.");
        return;
      }
  
      historyModal.classList.remove("hidden");
      historyModal.classList.add("flex");
  
      // Base layout inside modal
      historyContent.innerHTML = `
        <div id="roomHistoryWrapper" class="mb-6 text-xs text-gray-200">
          <div class="text-gray-400 text-sm font-mono">
            Loading mission history...
          </div>
        </div>
  
        <div class="flex justify-center mb-4">
          <button
            id="showGlobalBtn"
            class="px-4 py-2 text-[10px] font-cyber uppercase tracking-[0.2em]
                   border border-neon-blue rounded hover:bg-neon-blue/10 transition">
            VIEW GLOBAL RANKING
          </button>
        </div>
  
        <div id="globalRankingWrapper"
             class="mt-2 text-xs text-gray-200 hidden">
          <!-- Filled on demand -->
        </div>
      `;
  
      // Load only room history by default
      loadRoomHistory(roomId);
  
      // Wire up the "VIEW GLOBAL RANKING" toggle
      const showGlobalBtn = document.getElementById("showGlobalBtn");
      const globalWrapper = document.getElementById("globalRankingWrapper");
  
      if (showGlobalBtn && globalWrapper) {
        let globalLoadedOnce = false;
  
        showGlobalBtn.onclick = () => {
          const isHidden = globalWrapper.classList.contains("hidden");
  
          if (isHidden) {
            globalWrapper.classList.remove("hidden");
            showGlobalBtn.textContent = "HIDE GLOBAL RANKING";
  
            if (!globalLoadedOnce) {
              globalWrapper.innerHTML = `
                <div class="text-gray-400 text-sm font-mono">
                  Loading global ranking...
                </div>`;
              loadGlobalRanking(globalWrapper);
              globalLoadedOnce = true;
            }
          } else {
            globalWrapper.classList.add("hidden");
            showGlobalBtn.textContent = "VIEW GLOBAL RANKING";
          }
        };
      }
    };
  }
  
  // Close history modal
  if (closeHistoryBtn && historyModal) {
    closeHistoryBtn.onclick = () => {
      historyModal.classList.add("hidden");
    };
  }
  
  /**
   * Load ONLY the room's round history into #roomHistoryWrapper
   */
  async function loadRoomHistory(roomCode) {
    const wrapper = document.getElementById("roomHistoryWrapper");
    if (!wrapper) return;
  
    try {
      const roomSnap = await db.collection("rmcs_rooms").doc(roomCode).get();
      const data = roomSnap.data() || {};
      const history = data.history || [];
  
      let historyHtml = `
        <h4 class="font-cyber text-neon-blue text-sm tracking-widest mb-3">
          ROOM HISTORY
        </h4>
      `;
  
      if (!history.length) {
        historyHtml += `
          <div class="text-xs text-gray-500 font-mono mb-6">
            No rounds logged yet.
          </div>`;
      } else {
        historyHtml += `
          <div class="max-h-40 overflow-y-auto border border-gray-800 rounded mb-6">
            <table class="w-full text-xs font-mono">
              <thead class="bg-black/60">
                <tr>
                  <th class="px-2 py-1 text-left text-gray-400">#</th>
                  <th class="px-2 py-1 text-left text-gray-400">Result</th>
                  <th class="px-2 py-1 text-left text-gray-400">Time</th>
                </tr>
              </thead>
              <tbody>
                ${history
                  .map((h, idx) => {
                    const dt = new Date(h.timestamp || Date.now());
                    return `
                      <tr class="border-t border-gray-800">
                        <td class="px-2 py-1 text-gray-500">${idx + 1}</td>
                        <td class="px-2 py-1 ${
                          h.result === "Caught"
                            ? "text-neon-green"
                            : "text-red-400"
                        }">
                          ${h.result}
                        </td>
                        <td class="px-2 py-1 text-gray-400">
                          ${dt.toLocaleString()}
                        </td>
                      </tr>
                    `;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>
        `;
      }
  
      wrapper.innerHTML = historyHtml;
    } catch (e) {
      console.error(e);
      wrapper.innerHTML =
        '<div class="text-red-400 text-xs font-mono">Failed to load mission log.</div>';
    }
  }
  
  /**
   * Load GLOBAL leaderboard (and your season progress) into the given element
   */
  async function loadGlobalRanking(targetEl) {
    if (!targetEl) return;
  
    try {
      const usersSnap = await db
        .collection("users")
        .orderBy("xp", "desc")
        .limit(20)
        .get();
  
      let leaderboardHtml = `
        <h4 class="font-cyber text-neon-green text-sm tracking-widest mb-3">
          GLOBAL RANKING
        </h4>
      `;
  
      if (usersSnap.empty) {
        leaderboardHtml += `
          <div class="text-xs text-gray-500 font-mono">
            No agents ranked yet.
          </div>`;
      } else {
        leaderboardHtml += `
          <div class="max-h-40 overflow-y-auto border border-gray-800 rounded mb-4">
            <table class="w-full text-xs font-mono">
              <thead class="bg-black/60">
                <tr>
                  <th class="px-2 py-1 text-left text-gray-400">Rank</th>
                  <th class="px-2 py-1 text-left text-gray-400">Agent</th>
                  <th class="px-2 py-1 text-right text-gray-400">XP</th>
                  <th class="px-2 py-1 text-right text-gray-400">Season</th>
                </tr>
              </thead>
              <tbody>
                ${usersSnap.docs
                  .map((doc, idx) => {
                    const u = doc.data();
                    const xp = u.xp || 0;
                    const sxp = u.seasonXp || 0;
                    const level = 1 + Math.floor(sxp / 1000);
                    return `
                      <tr class="border-t border-gray-800">
                        <td class="px-2 py-1 text-gray-500">${idx + 1}</td>
                        <td class="px-2 py-1 text-gray-200">
                          ${u.username || "Agent"}
                        </td>
                        <td class="px-2 py-1 text-right text-neon-pink">${xp}</td>
                        <td class="px-2 py-1 text-right text-cyan-300">Lv.${level}</td>
                      </tr>
                    `;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>
        `;
      }
  
      // Your own season progress
      let myStats = "";
      const me = firebase.auth().currentUser;
      if (me) {
        const mySnap = await db.collection("users").doc(me.uid).get();
        if (mySnap.exists) {
          const u = mySnap.data();
          const sxp = u.seasonXp || 0;
          const level = 1 + Math.floor(sxp / 1000);
          myStats = `
            <div class="mt-2 p-3 border border-gray-800 rounded bg-black/40 text-xs font-mono">
              <div class="text-gray-400 mb-1">Your Season Progress</div>
              <div class="flex justify-between items-center">
                <span class="text-gray-200">${u.username || "Agent"}</span>
                <span class="text-cyan-300">Lv.${level} · ${sxp} XP</span>
              </div>
            </div>
          `;
        }
      }
  
      targetEl.innerHTML = leaderboardHtml + myStats;
    } catch (e) {
      console.error(e);
      targetEl.innerHTML =
        '<div class="text-red-400 text-xs font-mono">Failed to load global ranking.</div>';
    }
  }

  // --- 13. AUTO‑JOIN ROOM VIA ?room=XXXX ---
  (function autoJoinFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const autoRoom = params.get("room");
    if (!autoRoom) return;
    showScreen(joinScreen);
    const joinCodeInput = getEl("joinRoomCode");
    if (joinCodeInput) joinCodeInput.value = autoRoom;
    const waitForAuth = setInterval(() => {
      const user = firebase.auth().currentUser;
      if (!user) return;
      clearInterval(waitForAuth);
      const nameInput = getEl("joinPlayerName");
      if (nameInput && !nameInput.value.trim()) {
        nameInput.value = "Player_" + Math.floor(Math.random() * 9999);
      }
      setTimeout(() => {
        if (joinRoomFinal) joinRoomFinal.click();
      }, 800);
    }, 300);
  })();

  // Start public lobby watcher on load
  startLobbyBrowser();
});
