document.addEventListener("DOMContentLoaded", function() {
  let roomId = '';
  let playerName = '';
  let role = '';
  let revealedPlayers = [];

  // Create room handler
  document.getElementById('createRoom').onclick = () => {
    playerName = document.getElementById('playerName').value.trim();
    if (!playerName) return alert('Please enter your name');
    firebase.auth().onAuthStateChanged(async user => {
      if (!user) return alert('Wait till you are authenticated');
      try {
        const doc = await db.collection('rmcs_rooms').add({
          host: playerName,
          players: [{ name: playerName, id: user.uid }],
          state: 'waiting',
          created: Date.now()
        });
        roomId = doc.id;
        showRoom(roomId);
      } catch (error) {
        alert('Room creation error: ' + error.message);
      }
    });
  };

  // Join room handler
  document.getElementById('joinRoom').onclick = () => {
    playerName = document.getElementById('playerName').value.trim();
    const code = document.getElementById('joinCode').value.trim();
    if (!playerName || !code) return alert('Please enter both a name and room code');
    firebase.auth().onAuthStateChanged(async user => {
      if (!user) return alert('Wait till you are authenticated');
      const docRef = db.collection('rmcs_rooms').doc(code);
      const doc = await docRef.get();
      if (!doc.exists) return alert('Room not found');
      // Add player only if not already present
      if (!doc.data().players.some(p => p.id === user.uid)) {
        await docRef.update({
          players: firebase.firestore.FieldValue.arrayUnion({ name: playerName, id: user.uid })
        });
      }
      roomId = code;
      showRoom(roomId);
    });
  };

  // Display room and players, allow game start if enough
  function showRoom(roomCode) {
    const contentDiv = document.getElementById('gameContent');
    contentDiv.innerHTML = `
      <h2>Room Code: ${roomCode}</h2>
      <div id="playersList"></div>
      <button id="startGame" class="btn btn-primary">Start Game</button>
    `;
    document.getElementById('startGame').onclick = startGame;

    // Listen for changes and update UI
    db.collection('rmcs_rooms').doc(roomCode)
      .onSnapshot(doc => {
        const data = doc.data();
        let html = '<h3>Players in Room:</h3>';
        data.players.forEach(p => {
          html += `<div class="player-card">${p.name}</div>`;
        });
        document.getElementById('playersList').innerHTML = html;
        if (data.state === 'playing') {
          playRound(data);
        }
      });
  }

  // Start the game, check enough players
  async function startGame() {
    const doc = await db.collection('rmcs_rooms').doc(roomId).get();
    const data = doc.data();
    if (!data.players || data.players.length < 4) {
      alert('At least 4 players are required to start!');
      return;
    }
    await db.collection('rmcs_rooms').doc(roomId).update({
      state: 'playing',
      round: 1,
      maxRounds: 5
    });
  }

  // Actual role assignment and gameplay
  async function playRound(data) {
    const players = data.players;
    const roles = ['Raja', 'Mantri', 'Chor', 'Sipahi'];
    if (!players || players.length < roles.length) {
      document.getElementById('gameContent').innerHTML =
        '<div class="status-message">At least 4 players required. Please ask more friends to join!</div>';
      return;
    }
    // Create the role deck and shuffle
    let roleDeck = [...roles];
    for (let i = roles.length; i < players.length; i++) {
      roleDeck.push('Villager');
    }
    roleDeck = roleDeck.sort(() => Math.random() - 0.5);

    // Get this user's role from their index
    let playerRole = '';
    players.forEach((player, idx) => {
      if (player.id === firebase.auth().currentUser.uid) playerRole = roleDeck[idx];
    });

    // Show role and reveal button
    const contentDiv = document.getElementById('gameContent');
    contentDiv.innerHTML = `
      <div class="role-card">
        <h2>Your Role: ${playerRole}</h2>
        <button id="revealBtn" class="btn btn-primary">Reveal Role</button>
      </div>
      <div id="gameStatus"></div>
    `;

    document.getElementById('revealBtn').onclick = async () => {
      const unrevealed = data.revealedPlayers || [];
      if (unrevealed.some(p => p.id === firebase.auth().currentUser.uid)) {
        alert('Already revealed!');
        return;
      }
      await db.collection('rmcs_rooms').doc(roomId).update({
        revealedPlayers: firebase.firestore.FieldValue.arrayUnion({ id: firebase.auth().currentUser.uid, role: playerRole })
      });
    };

    db.collection('rmcs_rooms').doc(roomId).onSnapshot(doc => {
      const snapshotData = doc.data();
      const revealed = snapshotData.revealedPlayers || [];
      if (revealed.length >= 2) {
        const revealedText = revealed.map(r => `${r.role}`).join(', ');
        document.getElementById('gameStatus').innerText = `Revealed roles: ${revealedText}. Sipahi, guess the thief!`;
        guessUI(contentDiv, snapshotData);
      }
    });
  }

  // Guess UI and logic for Sipahi
  function guessUI(container, GameData) {
    container.innerHTML += `
      <input id="guessInput" placeholder="Enter thief name" class="input-field" />
      <button id="guessBtn" class="btn btn-success">Guess</button>
      <div id="guessResult"></div>
    `;
    document.getElementById('guessBtn').onclick = async () => {
      const guess = document.getElementById('guessInput').value.trim();
      if (!guess) return alert('Enter a name to guess!');
      const thiefPlayer = GameData.players.find(player => {
        const revealer = (GameData.revealedPlayers || []).find(r => r.id === player.id);
        return revealer && revealer.role === 'Chor';
      });
      const resultDiv = document.getElementById('guessResult');
      if (thiefPlayer && guess === thiefPlayer.name) {
        resultDiv.innerText = 'Correct! You caught the thief.';
      } else {
        resultDiv.innerText = 'Wrong! The thief gets away.';
      }
    };
  }
});
