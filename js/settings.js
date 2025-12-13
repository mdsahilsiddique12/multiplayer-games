(function() {
    // 1. INJECT CSS
    const style = document.createElement('style');
    style.innerHTML = `
        /* Settings Button (Top Right Fixed) */
        #gn-settings-trigger {
            position: fixed; top: 20px; right: 20px; z-index: 9990;
            background: rgba(0,0,0,0.6); border: 1px solid var(--neon-blue, #00f3ff);
            color: var(--neon-blue, #00f3ff); width: 40px; height: 40px;
            border-radius: 50%; display: flex; align-items: center; justify-content: center;
            cursor: pointer; transition: 0.3s; backdrop-filter: blur(4px);
        }
        #gn-settings-trigger:hover { background: var(--neon-blue, #00f3ff); color: #000; box-shadow: 0 0 15px var(--neon-blue, #00f3ff); }

        /* Modal Overlay */
        #gn-settings-modal {
            position: fixed; inset: 0; background: rgba(0,0,0,0.9);
            z-index: 10000; display: none; align-items: center; justify-content: center;
            backdrop-filter: blur(8px);
        }
        
        /* Modal Content */
        .gn-settings-box {
            width: 90%; max-width: 700px; height: 500px;
            background: #050510; border: 1px solid #333;
            display: flex; flex-direction: column; md:flex-row;
            box-shadow: 0 0 50px rgba(0, 243, 255, 0.1);
            position: relative; overflow: hidden; border-radius: 12px;
        }

        /* Sidebar */
        .gn-settings-sidebar {
            width: 200px; background: rgba(255,255,255,0.03);
            border-right: 1px solid #333; padding: 20px;
            display: flex; flex-direction: column; gap: 10px;
        }
        .gn-tab-btn {
            padding: 10px 15px; color: #888; text-align: left;
            font-family: 'Rajdhani', sans-serif; font-weight: bold; letter-spacing: 1px;
            background: transparent; border: none; cursor: pointer; transition: 0.2s;
            border-left: 2px solid transparent; text-transform: uppercase;
        }
        .gn-tab-btn:hover { color: #fff; background: rgba(255,255,255,0.05); }
        .gn-tab-btn.active { color: var(--neon-blue, #00f3ff); border-left-color: var(--neon-blue, #00f3ff); background: rgba(0, 243, 255, 0.1); }

        /* Content Area */
        .gn-settings-content { flex: 1; padding: 30px; overflow-y: auto; position: relative; }
        .gn-tab-pane { display: none; animation: fadeIn 0.3s; }
        .gn-tab-pane.active { display: block; }

        @keyframes fadeIn { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }

        /* Elements */
        .gn-profile-header { display: flex; align-items: center; gap: 20px; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #333; }
        .gn-avatar-circle { width: 70px; height: 70px; border-radius: 50%; border: 2px solid var(--neon-blue, #00f3ff); display: flex; align-items: center; justify-content: center; font-size: 2rem; background: #000; box-shadow: 0 0 15px rgba(0,243,255,0.2); }
        .gn-stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .gn-stat-box { background: rgba(0,0,0,0.5); border: 1px solid #333; padding: 10px; border-radius: 6px; }
        .gn-stat-label { font-size: 0.7rem; color: #888; text-transform: uppercase; letter-spacing: 1px; }
        .gn-stat-val { font-size: 1.2rem; font-weight: bold; color: #fff; font-family: 'Orbitron', monospace; }

        .gn-slider-row { margin-bottom: 25px; }
        .gn-slider-label { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.9rem; color: #ccc; }
        .gn-range { width: 100%; height: 6px; background: #333; outline: none; -webkit-appearance: none; border-radius: 3px; }
        .gn-range::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; background: var(--neon-blue, #00f3ff); border-radius: 50%; cursor: pointer; box-shadow: 0 0 10px var(--neon-blue, #00f3ff); }
        
        .gn-logout-btn {
            width: 100%; padding: 12px; margin-top: 20px;
            border: 1px solid #ff2a2a; color: #ff2a2a; background: transparent;
            font-family: 'Orbitron', monospace; letter-spacing: 2px;
            cursor: pointer; transition: 0.3s; text-transform: uppercase;
        }
        .gn-logout-btn:hover { background: #ff2a2a; color: #fff; box-shadow: 0 0 20px #ff2a2a; }

        .close-settings { position: absolute; top: 15px; right: 20px; font-size: 1.5rem; color: #888; cursor: pointer; }
        .close-settings:hover { color: #fff; }
    `;
    document.head.appendChild(style);

    // 2. CREATE HTML STRUCTURE
    const modalHtml = `
    <div id="gn-settings-trigger" onclick="openSettings()">
        <i class="fa-solid fa-gear"></i>
    </div>

    <div id="gn-settings-modal">
        <div class="gn-settings-box">
            <div class="close-settings" onclick="closeSettings()">&times;</div>
            
            <div class="gn-settings-sidebar">
                <button class="gn-tab-btn active" onclick="switchTab('profile')">Profile</button>
                <button class="gn-tab-btn" onclick="switchTab('audio')">Audio</button>
                <button class="gn-tab-btn" onclick="switchTab('system')">System</button>
            </div>

            <div class="gn-settings-content">
                <div id="tab-profile" class="gn-tab-pane active">
                    <div class="gn-profile-header">
                        <div class="gn-avatar-circle" id="st-avatar">👤</div>
                        <div>
                            <div class="text-sm text-gray-500 uppercase tracking-widest">OPERATIVE</div>
                            <h2 class="text-2xl text-white font-cyber" id="st-username">Loading...</h2>
                            <div class="text-xs text-neon-blue font-mono mt-1" id="st-uid">ID: ---</div>
                        </div>
                    </div>
                    <div class="gn-stat-grid">
                        <div class="gn-stat-box">
                            <div class="gn-stat-label">Wallet Balance</div>
                            <div class="gn-stat-val text-yellow-400" id="st-coins">0 CR</div>
                        </div>
                        <div class="gn-stat-box">
                            <div class="gn-stat-label">Experience</div>
                            <div class="gn-stat-val text-purple-400" id="st-xp">0 XP</div>
                        </div>
                    </div>
                    <div class="mt-6 p-4 border border-gray-800 bg-black/40 rounded text-xs text-gray-400 leading-relaxed">
                        <strong class="text-white block mb-2">ACCOUNT STATUS</strong>
                        Current Badge: <span id="st-badge" class="text-white">ROOKIE</span><br>
                        Member Since: <span id="st-joined">---</span>
                    </div>
                </div>

                <div id="tab-audio" class="gn-tab-pane">
                    <h3 class="font-cyber text-xl text-white mb-6 border-b border-gray-800 pb-2">AUDIO CONTROL</h3>
                    
                    <div class="gn-slider-row">
                        <div class="gn-slider-label">
                            <span>MASTER MUTE</span>
                            <span id="st-mute-label" class="text-neon-blue">ACTIVE</span>
                        </div>
                        <label class="flex items-center cursor-pointer gap-3">
                            <input type="checkbox" id="st-mute-check" class="w-5 h-5 accent-[#00f3ff]" onchange="toggleMuteSetting(this)">
                            <span class="text-xs text-gray-400">Enable Sound</span>
                        </label>
                    </div>

                    <div class="gn-slider-row">
                        <div class="gn-slider-label">
                            <span>BGM VOLUME</span>
                            <span id="vol-bgm-val">30%</span>
                        </div>
                        <input type="range" class="gn-range" min="0" max="1" step="0.01" id="vol-bgm" oninput="updateVol('bgm', this.value)">
                    </div>

                    <div class="gn-slider-row">
                        <div class="gn-slider-label">
                            <span>SFX VOLUME</span>
                            <span id="vol-sfx-val">60%</span>
                        </div>
                        <input type="range" class="gn-range" min="0" max="1" step="0.01" id="vol-sfx" oninput="updateVol('sfx', this.value)">
                    </div>
                </div>

                <div id="tab-system" class="gn-tab-pane">
                    <h3 class="font-cyber text-xl text-white mb-6 border-b border-gray-800 pb-2">SYSTEM</h3>
                    
                    <div class="space-y-4">
                        <a href="tos.html" class="block p-3 border border-gray-800 bg-black/40 hover:bg-gray-800 transition rounded text-gray-300 text-sm no-underline">
                            <i class="fa-solid fa-file-contract mr-2"></i> Terms of Service
                        </a>
                        <a href="privacy.html" class="block p-3 border border-gray-800 bg-black/40 hover:bg-gray-800 transition rounded text-gray-300 text-sm no-underline">
                            <i class="fa-solid fa-shield-halved mr-2"></i> Privacy Policy
                        </a>
                    </div>

                    <button class="gn-logout-btn" onclick="triggerLogout()">
                        <i class="fa-solid fa-power-off mr-2"></i> DISCONNECT SESSION
                    </button>
                    
                    <div class="text-center text-[10px] text-gray-600 mt-4 font-mono">
                        GAME NEXUS v1.2.0-BETA<br>ID: PROTOCOL-2448
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;
    
    // Inject HTML
    const div = document.createElement('div');
    div.innerHTML = modalHtml;
    document.body.appendChild(div);

})();

// 3. LOGIC FUNCTIONS
window.openSettings = async function() {
    document.getElementById('gn-settings-modal').style.display = 'flex';
    
    // Load Audio Values
    const muteState = localStorage.getItem('gn_muted') === 'true';
    document.getElementById('st-mute-check').checked = !muteState;
    document.getElementById('vol-bgm').value = SonicCore.bgmVolume;
    document.getElementById('vol-sfx').value = SonicCore.sfxVolume;
    
    // Fetch Profile Data
    const user = firebase.auth().currentUser;
    if(user) {
        document.getElementById('st-username').innerText = user.displayName || "Unknown Agent";
        document.getElementById('st-uid').innerText = "ID: " + user.uid.substring(0,8) + "...";
        
        try {
            const doc = await firebase.firestore().collection('users').doc(user.uid).get();
            if(doc.exists) {
                const d = doc.data();
                document.getElementById('st-coins').innerText = (d.coins || 0) + " CR";
                document.getElementById('st-xp').innerText = (d.xp || 0) + " XP";
                document.getElementById('st-badge').innerText = (d.badge || "ROOKIE").toUpperCase();
                
                if(d.createdAt) {
                    const date = d.createdAt.toDate ? d.createdAt.toDate() : new Date();
                    document.getElementById('st-joined').innerText = date.toLocaleDateString();
                }
            }
        } catch(e) { console.log("Stats fetch error", e); }
    } else {
        document.getElementById('st-username').innerText = "GUEST / OFFLINE";
    }
};

window.closeSettings = function() {
    document.getElementById('gn-settings-modal').style.display = 'none';
};

window.switchTab = function(tabName) {
    // Buttons
    document.querySelectorAll('.gn-tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    
    // Panes
    document.querySelectorAll('.gn-tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + tabName).classList.add('active');
};

window.updateVol = function(type, val) {
    if(type === 'bgm') {
        SonicCore.setBGMVolume(val);
        document.getElementById('vol-bgm-val').innerText = Math.round(val*100) + "%";
    }
    if(type === 'sfx') {
        SonicCore.setSFXVolume(val);
        document.getElementById('vol-sfx-val').innerText = Math.round(val*100) + "%";
    }
};

window.toggleMuteSetting = function(checkbox) {
    const isMuted = !checkbox.checked;
    SonicCore.toggleMute(isMuted);
    window.showToast(isMuted ? "Audio Muted" : "Audio Enabled", "info");
};

window.triggerLogout = function() {
    if(confirm("Confirm Disconnect? This will end your session.")) {
        localStorage.removeItem('gn_remember');
        firebase.auth().signOut().then(() => window.location.reload());
    }
};
