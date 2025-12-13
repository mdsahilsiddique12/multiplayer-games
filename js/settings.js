(function() {
    // 1. INJECT CSS (PREMIUM CYBERPUNK THEME)
    const style = document.createElement('style');
    style.innerHTML = `
        /* --- 1. SETTINGS TRIGGER (Gear Icon) --- */
        #gn-settings-trigger {
            position: fixed; 
            bottom: 20px; 
            left: 20px; /* MOVED TO LEFT */
            z-index: 100001; /* Above everything (including CRT overlays) */
            width: 45px; height: 45px;
            background: rgba(5, 5, 16, 0.8);
            border: 1px solid var(--neon-blue, #00f3ff);
            color: var(--neon-blue, #00f3ff);
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
            backdrop-filter: blur(5px);
            box-shadow: 0 0 15px rgba(0, 243, 255, 0.2);
            font-size: 1.2rem;
        }
        #gn-settings-trigger:hover { 
            background: var(--neon-blue, #00f3ff); 
            color: #000; 
            box-shadow: 0 0 25px var(--neon-blue, #00f3ff);
            transform: rotate(90deg) scale(1.1);
        }

        /* --- 2. MODAL OVERLAY --- */
        #gn-settings-modal {
            position: fixed; inset: 0; 
            background: rgba(0, 0, 0, 0.92); /* Darker backdrop */
            z-index: 100002; 
            display: none; 
            align-items: center; justify-content: center;
            backdrop-filter: blur(12px);
            animation: modalFadeIn 0.2s ease-out;
        }

        /* --- 3. MAIN SETTINGS BOX --- */
        .gn-settings-box {
            width: 95%; max-width: 800px; 
            height: 85vh; /* TALLER HEIGHT */
            max-height: 700px;
            background: linear-gradient(135deg, #050510 0%, #0a0a15 100%);
            border: 1px solid rgba(0, 243, 255, 0.3);
            display: flex; flex-direction: column; 
            box-shadow: 0 0 80px rgba(0, 243, 255, 0.15), inset 0 0 30px rgba(0,0,0,0.8);
            border-radius: 16px;
            overflow: hidden;
            position: relative;
        }
        
        /* Mobile Layout Adjustment */
        @media (min-width: 768px) {
            .gn-settings-box { flex-direction: row; }
        }

        /* --- 4. SIDEBAR --- */
        .gn-settings-sidebar {
            width: 100%; 
            background: rgba(0, 0, 0, 0.6);
            border-bottom: 1px solid #333;
            padding: 20px;
            display: flex; flex-direction: row; gap: 10px;
            overflow-x: auto;
        }
        @media (min-width: 768px) {
            .gn-settings-sidebar {
                width: 240px; 
                flex-direction: column; 
                border-bottom: none; 
                border-right: 1px solid #333;
                padding-top: 60px; /* Space for title */
            }
        }

        .gn-tab-btn {
            padding: 12px 20px; 
            color: #64748b; 
            text-align: center;
            font-family: 'Rajdhani', sans-serif; 
            font-weight: 700; 
            font-size: 0.9rem;
            letter-spacing: 2px;
            background: transparent; 
            border: 1px solid transparent; 
            border-radius: 8px;
            cursor: pointer; 
            transition: all 0.3s;
            text-transform: uppercase;
            white-space: nowrap;
        }
        @media (min-width: 768px) { .gn-tab-btn { text-align: left; } }

        .gn-tab-btn:hover { color: #fff; background: rgba(255,255,255,0.03); border-color: #333; }
        
        .gn-tab-btn.active { 
            color: #000; 
            background: var(--neon-blue, #00f3ff); 
            box-shadow: 0 0 15px rgba(0, 243, 255, 0.4);
            border-color: var(--neon-blue, #00f3ff);
        }

        /* --- 5. CONTENT AREA --- */
        .gn-settings-content { 
            flex: 1; 
            padding: 40px; 
            overflow-y: auto; 
            position: relative; 
            background: radial-gradient(circle at top right, rgba(0, 243, 255, 0.05), transparent 40%);
        }
        
        /* --- CUSTOM SCROLLBAR (NEON) --- */
        .gn-settings-content::-webkit-scrollbar { width: 6px; }
        .gn-settings-content::-webkit-scrollbar-track { background: #050510; }
        .gn-settings-content::-webkit-scrollbar-thumb { 
            background: #334155; 
            border-radius: 3px; 
            transition: background 0.3s;
        }
        .gn-settings-content::-webkit-scrollbar-thumb:hover { background: var(--neon-blue, #00f3ff); }

        /* Animation for Tabs */
        .gn-tab-pane { display: none; animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        .gn-tab-pane.active { display: block; }
        @keyframes slideIn { from { opacity:0; transform:translateX(10px); } to { opacity:1; transform:translateX(0); } }
        @keyframes modalFadeIn { from { opacity:0; transform:scale(0.98); } to { opacity:1; transform:scale(1); } }

        /* --- UI ELEMENTS --- */
        .gn-section-title {
            font-family: 'Orbitron', sans-serif;
            font-size: 1.4rem; color: #fff;
            margin-bottom: 25px; padding-bottom: 10px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            letter-spacing: 2px;
            text-shadow: 0 0 10px rgba(255,255,255,0.2);
        }

        .gn-profile-header { display: flex; align-items: center; gap: 25px; margin-bottom: 30px; }
        .gn-avatar-circle { 
            width: 80px; height: 80px; border-radius: 50%; 
            border: 2px solid var(--neon-blue, #00f3ff); 
            display: flex; align-items: center; justify-content: center; 
            font-size: 2.5rem; background: #000; 
            box-shadow: 0 0 25px rgba(0,243,255,0.15); 
        }

        .gn-stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
        .gn-stat-box { 
            background: rgba(255,255,255,0.03); 
            border: 1px solid rgba(255,255,255,0.08); 
            padding: 15px; border-radius: 12px; 
            transition: 0.3s;
        }
        .gn-stat-box:hover { border-color: var(--neon-blue, #00f3ff); background: rgba(0, 243, 255, 0.02); }

        /* Sliders */
        .gn-slider-row { 
            background: rgba(0,0,0,0.3); border: 1px solid #333; 
            padding: 20px; border-radius: 12px; margin-bottom: 20px; 
        }
        .gn-range { 
            width: 100%; height: 6px; background: #1e293b; 
            outline: none; -webkit-appearance: none; border-radius: 3px; margin-top: 10px; 
        }
        .gn-range::-webkit-slider-thumb { 
            -webkit-appearance: none; width: 18px; height: 18px; 
            background: var(--neon-blue, #00f3ff); border-radius: 50%; 
            cursor: pointer; box-shadow: 0 0 15px var(--neon-blue, #00f3ff); 
            transition: transform 0.2s;
        }
        .gn-range::-webkit-slider-thumb:hover { transform: scale(1.2); }

        /* Logout Button */
        .gn-logout-btn {
            width: 100%; padding: 16px; margin-top: 30px;
            border: 1px solid #ef4444; color: #ef4444; 
            background: linear-gradient(90deg, transparent, rgba(239, 68, 68, 0.05), transparent);
            font-family: 'Orbitron', monospace; letter-spacing: 3px; font-weight: 700;
            cursor: pointer; transition: 0.3s; text-transform: uppercase;
            border-radius: 8px;
        }
        .gn-logout-btn:hover { 
            background: #ef4444; color: #fff; 
            box-shadow: 0 0 30px rgba(239, 68, 68, 0.4); 
            transform: translateY(-2px);
        }

        .close-settings { 
            position: absolute; top: 20px; right: 25px; 
            font-size: 2rem; color: #64748b; cursor: pointer; z-index: 10;
            line-height: 0.8;
        }
        .close-settings:hover { color: #fff; text-shadow: 0 0 10px white; }

        .tag-badge { 
            display: inline-block; padding: 4px 12px; border-radius: 20px; 
            font-size: 0.7rem; font-weight: bold; letter-spacing: 1px; margin-top: 5px;
            background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
        }
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
                <div class="hidden md:block px-6 pb-6 text-xs text-gray-500 font-mono tracking-widest">
                    SYSTEM CONFIG
                </div>
                <button class="gn-tab-btn active" onclick="switchTab('profile')">
                    <i class="fa-regular fa-id-card mr-2"></i> Identity
                </button>
                <button class="gn-tab-btn" onclick="switchTab('audio')">
                    <i class="fa-solid fa-sliders mr-2"></i> Audio
                </button>
                <button class="gn-tab-btn" onclick="switchTab('system')">
                    <i class="fa-solid fa-terminal mr-2"></i> System
                </button>
            </div>

            <div class="gn-settings-content" id="gn-content-area">
                
                <div id="tab-profile" class="gn-tab-pane active">
                    <h3 class="gn-section-title">OPERATIVE IDENTITY</h3>
                    
                    <div class="gn-profile-header">
                        <div class="gn-avatar-circle" id="st-avatar">👤</div>
                        <div>
                            <div class="text-xs text-neon-blue font-bold tracking-[0.3em] mb-1">ONLINE</div>
                            <h2 class="text-3xl text-white font-cyber tracking-wide" id="st-username">LOADING...</h2>
                            <div class="tag-badge" id="st-badge">ROOKIE</div>
                        </div>
                    </div>

                    <div class="gn-stat-grid">
                        <div class="gn-stat-box">
                            <div class="text-xs text-gray-400 font-mono mb-1">CREDITS (CR)</div>
                            <div class="text-2xl text-yellow-400 font-cyber" id="st-coins">0</div>
                        </div>
                        <div class="gn-stat-box">
                            <div class="text-xs text-gray-400 font-mono mb-1">EXPERIENCE (XP)</div>
                            <div class="text-2xl text-purple-400 font-cyber" id="st-xp">0</div>
                        </div>
                    </div>

                    <div class="p-5 border border-dashed border-gray-700 rounded-lg bg-black/20">
                        <div class="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Unique Identifier</div>
                        <div class="font-mono text-neon-blue text-sm select-all" id="st-uid">---</div>
                        <div class="text-[10px] text-gray-500 uppercase tracking-widest mt-4 mb-2">Service Record</div>
                        <div class="font-mono text-gray-300 text-sm" id="st-joined">---</div>
                    </div>
                </div>

                <div id="tab-audio" class="gn-tab-pane">
                    <h3 class="gn-section-title">AUDIO INTERFACE</h3>
                    
                    <div class="gn-slider-row flex items-center justify-between">
                        <div>
                            <div class="text-white font-bold tracking-wider">MASTER AUDIO</div>
                            <div class="text-xs text-gray-500">Toggle all system sounds</div>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="st-mute-check" class="sr-only peer" onchange="toggleMuteSetting(this)">
                            <div class="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-neon-blue"></div>
                        </label>
                    </div>

                    <div class="gn-slider-row">
                        <div class="flex justify-between mb-2">
                            <span class="text-sm text-gray-300 font-bold tracking-wider">MUSIC (BGM)</span>
                            <span id="vol-bgm-val" class="text-sm text-neon-blue font-mono">30%</span>
                        </div>
                        <input type="range" class="gn-range" min="0" max="1" step="0.01" id="vol-bgm" oninput="updateVol('bgm', this.value)">
                    </div>

                    <div class="gn-slider-row">
                        <div class="flex justify-between mb-2">
                            <span class="text-sm text-gray-300 font-bold tracking-wider">SOUND EFFECTS (SFX)</span>
                            <span id="vol-sfx-val" class="text-sm text-neon-blue font-mono">60%</span>
                        </div>
                        <input type="range" class="gn-range" min="0" max="1" step="0.01" id="vol-sfx" oninput="updateVol('sfx', this.value)">
                    </div>
                </div>

                <div id="tab-system" class="gn-tab-pane">
                    <h3 class="gn-section-title">SYSTEM PROTOCOLS</h3>
                    
                    <div class="grid gap-4">
                        <a href="tos.html" class="flex items-center p-4 border border-gray-800 bg-gray-900/50 hover:bg-gray-800 transition rounded-lg text-gray-300 no-underline group">
                            <i class="fa-solid fa-file-contract text-xl mr-4 text-gray-500 group-hover:text-neon-blue"></i>
                            <div>
                                <div class="font-bold text-white">Terms of Service</div>
                                <div class="text-xs text-gray-500">Review legal parameters</div>
                            </div>
                        </a>
                        <a href="privacy.html" class="flex items-center p-4 border border-gray-800 bg-gray-900/50 hover:bg-gray-800 transition rounded-lg text-gray-300 no-underline group">
                            <i class="fa-solid fa-shield-halved text-xl mr-4 text-gray-500 group-hover:text-neon-blue"></i>
                            <div>
                                <div class="font-bold text-white">Privacy Policy</div>
                                <div class="text-xs text-gray-500">Data protection protocols</div>
                            </div>
                        </a>
                    </div>

                    <button class="gn-logout-btn" onclick="triggerLogout()">
                        <i class="fa-solid fa-power-off mr-3"></i> TERMINATE SESSION
                    </button>
                    
                    <div class="text-center text-[10px] text-gray-700 mt-8 font-mono tracking-widest">
                        GAME NEXUS STUDIOS<br>BUILD: v1.2.0-RC
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
    document.getElementById('vol-bgm-val').innerText = Math.round(SonicCore.bgmVolume * 100) + "%";
    document.getElementById('vol-sfx-val').innerText = Math.round(SonicCore.sfxVolume * 100) + "%";
    
    // Fetch Profile Data
    const user = firebase.auth().currentUser;
    if(user) {
        document.getElementById('st-username').innerText = (user.displayName || "AGENT").toUpperCase();
        document.getElementById('st-uid').innerText = user.uid;
        
        try {
            const doc = await firebase.firestore().collection('users').doc(user.uid).get();
            if(doc.exists) {
                const d = doc.data();
                document.getElementById('st-coins').innerText = (d.coins || 0).toLocaleString();
                document.getElementById('st-xp').innerText = (d.xp || 0).toLocaleString();
                document.getElementById('st-badge').innerText = (d.badge || "ROOKIE").toUpperCase();
                
                if(d.createdAt) {
                    const date = d.createdAt.toDate ? d.createdAt.toDate() : new Date();
                    document.getElementById('st-joined').innerText = date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
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
    // Buttons Active State
    document.querySelectorAll('.gn-tab-btn').forEach(b => b.classList.remove('active'));
    event.currentTarget.classList.add('active'); // Use currentTarget to handle button clicks accurately
    
    // Show correct Pane
    document.querySelectorAll('.gn-tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + tabName).classList.add('active');

    // >>> SCROLL RESET LOGIC <<<
    // This forces the content area back to the top whenever you switch tabs
    document.getElementById('gn-content-area').scrollTop = 0;
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
    window.showToast(isMuted ? "Audio System Muted" : "Audio System Online", isMuted ? "warning" : "success");
};

window.triggerLogout = function() {
    if(confirm("Confirm Disconnect? This will end your current session.")) {
        localStorage.removeItem('gn_remember');
        firebase.auth().signOut().then(() => window.location.reload());
    }
};
