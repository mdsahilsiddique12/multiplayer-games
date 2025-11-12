// Detective Killer game logic
// Firebase multiplayer code will go here
console.log("Detective game loaded");

// Example: Room creation and joining logic
document.getElementById('createRoom').onclick = async function() {
    const playerName = document.getElementById('playerName').value.trim();
    if (!playerName) return alert('Enter your name!');
    // Firebase code to create room
    // db.collection('detective_rooms').add({...})
};

document.getElementById('joinRoom').onclick = async function() {
    const playerName = document.getElementById('playerName').value.trim();
    const roomCode = document.getElementById('joinCode').value.trim();
    if (!playerName || !roomCode) return alert('Enter name and room code!');
    // Firebase code to join room
    // db.collection('detective_rooms').doc(roomCode).get()
};
