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
  const roundTransition = getEl("roundTransition");

  const openStoreBtn = getEl("openStoreBtn");
  const userCoinsEl = getEl("userCoins");
  const storeGrid = getEl("storeGrid");

  const historyModal = getEl("historyModal");
  const historyContent = getEl("historyContent");
  const openHistoryBtn = getEl("openHistoryBtn");
  const closeHistoryBtn = getEl("closeHistoryBtn");

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
      // Ensure defaults exist
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

  // --- 5. IN‑GAME SHOP / BLACK MARKET ---

  const STORE_ITEMS = [
    // AVATARS
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
    // NAME COLORS
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
    // SOUND PACKS
    {
      id: "meme_pack",
      name: "Meme Sound Pack",
      type: "sounds",
      price: 180,
      requiresVip: false,
      emoji: "😂",
      desc: "Sabash / Failure / Drum Roll pack."
    },
    // VIP PASSES / BOOSTS
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

    // bind buy buttons
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

  // Menu buttons
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

  // Store button
  if (openStoreBtn && storeScreen) {
    openStoreBtn.onclick = () => {
      showScreen(storeScreen);
      refreshUserCoinsUI();
      window.filterStore("avatars");
    };
  }

  // Copy room code / link
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
    exitLobbyBtn.onclick = () => {
      if (unsubscribe) unsubscribe();
      showScreen(mainMenu);
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

        await ref.set({
          host: uid,
          players: [playerData],
          phase: "lobby",
          scores: { [uid]: 0 },
          muted: [],
          history: [],
          created: firebase.firestore.FieldValue.serverTimestamp()
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

        if (!data.players.some((p) => p.id === uid)) {
          if (data.players.length >= MAX_PLAYERS) {
            return alert(`Squad Full (${data.players.length}/${MAX_PLAYERS})`);
          }
          await ref.update({
            players: firebase.firestore.FieldValue.arrayUnion(playerData),
            [`scores.${uid}`]: 0
          });
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

  // --- 8. GAME LOOP ---
  function listenToRoom(roomCode) {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    const roomRef = db.collection("rmcs_rooms").doc(roomCode);

    unsubscribe = roomRef.onSnapshot((docSnap) => {
      const data = docSnap.data();
      const user = firebase.auth().currentUser;
      if (!user) return;

      const selfId = user.uid;
      if (!data) {
        alert("Mission Aborted (Room Closed)");
        showScreen(mainMenu);
        return;
      }
      if (!data.players.some((p) => p.id === selfId)) {
        alert("Kicked from Squad");
        showScreen(mainMenu);
        return;
      }

      // Update room meta
      if (currentRoomCode) currentRoomCode.innerText = roomCode;
      renderPlayersList(
        data.players,
        data.host,
        selfId,
        selfId === data.host,
        data.muted || []
      );
      renderScoreboard(data.scores || {}, data.players);

      if (roomPlayerCountEl) {
        roomPlayerCountEl.textContent = data.players.length;
      }

      const isHost = selfId === data.host;

      if (cancelRoomBtn) {
        cancelRoomBtn.style.display = isHost ? "block" : "none";
        cancelRoomBtn.onclick = () => {
          if (confirm("Abort Mission?")) roomRef.delete();
        };
      }

      // Host player management (kick / mute)
      if (isHost) {
        bindHostPlayerControls(roomRef);
      }

      // Phase transitions
      if (data.phase !== lastPhase) {
        if (data.phase === "reveal") {
          playSound("reveal");
          if (roundTransition) {
            roundTransition.classList.remove("hidden");
            roundTransition.style.display = "flex";
            setTimeout(() => {
              roundTransition.style.display = "none";
            }, 2500);
          }
        }
      }
      lastPhase = data.phase;

      // Lobby vs Game UI
      if (data.phase === "lobby") {
        // hide overlay, show avatars
        if (gameContent) gameContent.style.display = "none";
        renderAvatarsTable(data.players, selfId, data.host);

        if (startGameBtn) {
          startGameBtn.style.display = "flex";

          const playerCount = data.players.length;
          const canStart = isHost && playerCount >= MIN_PLAYERS;

          startGameBtn.disabled = !canStart;
          startGameBtn.innerText = canStart
            ? "INITIATE SEQUENCE"
            : `WAITING (${playerCount}/${MIN_PLAYERS})`;

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

            const pr = data.players.map((p, i) => ({
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
        // game mode: show overlay
        if (gameContent) gameContent.style.display = "flex";
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

    // auto‑advance when Raja & Sipahi exposed
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

    if (!data.scoreUpdated) {
      if (isCorrect) playSound("caught");
      else playSound("escaped");
    }

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

    const resultText = isCorrect ? "TARGET NEUTRALIZED" : "MISSION FAILED";
    const resultColor = isCorrect ? "text-neon-green" : "text-red-500";
    const resultEmoji = isCorrect ? "🎯" : "🤡";
    const roleMap = {};
    data.playerRoles.forEach((p) => (roleMap[p.role] = p.name));

    gameContent.innerHTML = `
      <div class="flex flex-col items-center w-full max-w-sm animate-fade-in">
        <div class="text-6xl mb-2">${resultEmoji}</div>
        <h2 class="font-cyber text-2xl ${resultColor} mb-6 tracking-widest border-b border-gray-700 pb-2 w-full text-center">
          ${resultText}
        </h2>

        <div class="w-full text-sm space-y-2 font-mono text-left mb-6 bg-black/40 p-4 rounded border border-gray-800">
          <div class="flex justify-between items-center">
            <span class="text-yellow-300">👑 RAJA</span>
            <span class="text-white font-bold">${roleMap["Raja"] || "-"}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-fuchsia-300">🧠 MANTRI</span>
            <span class="text-white font-bold">${roleMap["Mantri"] || "-"}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-cyan-300">🛡️ SIPAHI</span>
            <span class="text-white font-bold">${roleMap["Sipahi"] || "-"}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-rose-400">🔪 CHOR</span>
            <span class="text-white font-bold">${roleMap["Chor"] || "-"}</span>
          </div>
        </div>

        ${
          isHost
            ? `<button id="rebootBtn" class="cyber-btn w-full py-3 shadow-[0_0_20px_rgba(0,243,255,0.3)]">
                 REBOOT SYSTEM
               </button>`
            : `<div class="text-xs text-gray-500 animate-pulse">WAITING FOR HOST...</div>`
        }
      </div>
    `;

    if (isHost) {
      setTimeout(() => {
        const btn = getEl("rebootBtn");
        if (btn) {
          btn.onclick = () => {
            btn.innerText = "INITIALIZING...";
            const playerCount = data.playerRoles.length;
            const baseRoles = ["Raja", "Mantri", "Chor", "Sipahi"];
            const extraCount = Math.max(0, playerCount - baseRoles.length);
            const extraRoles = Array.from(
              { length: extraCount },
              () => "Civilian"
            );
            const roles = [...baseRoles, ...extraRoles].sort(
              () => Math.random() - 0.5
            );
            const pr = data.playerRoles.map((p, i) => ({
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
      }, 100);
    }
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
            roomRef.update({
              players: newPlayers,
              scores: newScores,
              muted: newMuted
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

        const tagText = isHost
          ? "HOST"
          : isVip
          ? "VIP"
          : "AGENT";

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

      let badge = "";
      const isHost = p.id === hostId;
      const isVip = !!p.isVip;
      if (isHost) badge = "👑";
      else if (isVip) badge = "⭐";
      else badge = "🎮";

      el.innerHTML = `
        <span class="text-3xl drop-shadow-md">${icon}</span>
        <div class="avatar-name" style="${getNameStyleForPlayer(p, hostId)}">
          ${badge} ${p.name}
        </div>
      `;

      if (p.id === selfId) {
        el.style.borderColor = "var(--neon-green)";
        el.style.boxShadow = "0 0 20px var(--neon-green)";
      }

      table.appendChild(el);
    });
  }

  // --- 12. HISTORY MODAL & GLOBAL LEADERBOARD (PUBLIC RANKING) ---

  if (openHistoryBtn && historyModal && historyContent) {
    openHistoryBtn.onclick = () => {
      if (!roomId) {
        alert("No active room log.");
        return;
      }
      historyModal.classList.remove("hidden");
      historyModal.classList.add("flex");
      historyContent.innerHTML =
        '<div class="text-gray-400 text-sm font-mono">Loading mission log & leaderboard...</div>';
      loadHistoryAndLeaderboard(roomId);
    };
  }

  if (closeHistoryBtn && historyModal) {
    closeHistoryBtn.onclick = () => {
      historyModal.classList.add("hidden");
    };
  }

  async function loadHistoryAndLeaderboard(roomCode) {
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

      // Global leaderboard
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

      // Current user stats
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

      historyContent.innerHTML = `
        <div class="text-xs text-gray-200">
          ${historyHtml}
          ${leaderboardHtml}
          ${myStats}
        </div>
      `;
    } catch (e) {
      console.error(e);
      historyContent.innerHTML =
        '<div class="text-red-400 text-xs font-mono">Failed to load mission log.</div>';
    }
  }

  // --- 13. AUTO‑JOIN ROOM VIA ?room=XXXX ---
  (function autoJoinFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const autoRoom = params.get("room");
    if (!autoRoom) return;

    // Move to Join screen
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
});
