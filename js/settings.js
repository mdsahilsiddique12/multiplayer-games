(function() {
    // 1. INJECT CSS
    const style = document.createElement('style');
    style.innerHTML = `
        /* --- 1. SETTINGS TRIGGER (Gear Icon) --- */
        #gn-settings-trigger {
            position: fixed; 
            bottom: 20px; 
            left: 20px; 
            z-index: 2147483647 !important;
            width: 55px; height: 55px;
            
            /* --- ORANGE THEME --- */
            background: rgba(10, 5, 0, 0.9); 
            border: 2px solid #ffae00;       
            color: #ffae00;                  
            box-shadow: 0 0 20px rgba(255, 174, 0, 0.6); 
            
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; 
            transition: all 0.3s;
            backdrop-filter: blur(5px);
            
            /* FORCE GPU LAYER */
            transform: translateZ(9999px); 
        }

        /* SVG STYLING */
        #gn-settings-trigger svg {
            width: 28px;
            height: 28px;
            fill: #ffae00; /* Force Orange Fill */
            transition: transform 0.5s ease;
        }

        #gn-settings-trigger:hover { 
            background: #ffae00;       
            box-shadow: 0 0 40px #ffae00; 
            transform: scale(1.1);
        }
        
        #gn-settings-trigger:hover svg {
            fill: #000; /* Turn icon black on hover */
            transform: rotate(180deg);
        }

        /* --- 2. MODAL OVERLAY --- */
        #gn-settings-modal {
            position: fixed; inset: 0; 
            background: rgba(0, 0, 0, 0.95); 
            z-index: 2147483648; 
            display: none; 
            align-items: center; justify-content: center;
            backdrop-filter: blur(12px);
            animation: modalFadeIn 0.2s ease-out;
        }

        /* --- 3. MAIN SETTINGS BOX --- */
        .gn-settings-box {
            width: 95%; max-width: 800px; 
            height: 85vh; 
            max-height: 700px;
            background: linear-gradient(135deg, #050510 0%, #0a0a15 100%);
            border: 1px solid rgba(255, 174, 0, 0.3);
            display: flex; flex-direction: column; 
            box-shadow: 0 0 80px rgba(255, 174, 0, 0.1), inset 0 0 30px rgba(0,0,0,0.8);
            border-radius: 16px;
            overflow: hidden;
            position: relative;
        }
        
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
                padding-top: 60px; 
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
            background: #ffae00; 
            box-shadow: 0 0 15px rgba(255, 174, 0, 0.4);
            border-color: #ffae00;
        }

        /* --- 5. CONTENT AREA --- */
        .gn-settings-content { 
            flex: 1; 
            padding: 40px; 
            overflow-y: auto; 
            position: relative; 
            background: radial-gradient(circle at top right, rgba(255, 174, 0, 0.05), transparent 40%);
        }
        
        .gn-settings-content::-webkit-scrollbar { width: 6px; }
        .gn-settings-content::-webkit-scrollbar-track { background: #050510; }
        .gn-settings-content::-webkit-scrollbar-thumb { 
            background: #334155; 
            border-radius: 3px; 
            transition: background 0.3s;
        }
        .gn-settings-content::-webkit-scrollbar-thumb:hover { background: #ffae00; }

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
            border: 2px solid #ffae00; 
            display: flex; align-items: center; justify-content: center; 
            font-size: 2.5rem; background: #000; 
            box-shadow: 0 0 25px rgba(255, 174, 0, 0.15); 
        }

        .gn-stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
        .gn-stat-box { 
            background: rgba(255,255,255,0.03); 
            border: 1px solid rgba(255,255,255,0.08); 
            padding: 15px; border-radius: 12px; 
            transition: 0.3s;
        }
        .gn-stat-box:hover { border-color: #ffae00; background: rgba(255, 174, 0, 0.02); }

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
            background: #ffae00; border-radius: 50%; 
            cursor: pointer; box-shadow: 0 0 15px #ffae00; 
            transition: transform 0.2s;
        }
        .gn-range::-webkit-slider-thumb:hover { transform: scale(1.2); }

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

    // 2. CREATE HTML STRUCTURE WITH DIRECT SVG (NO FONT AWESOME FOR TRIGGER)
    const modalHtml = `
    <div id="gn-settings-trigger" onclick="openSettings()">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
            <path d="M495.9 166.6c3.2 8.7 .5 18.4-6.4 24.6l-43.3 39.4c1.1 8.3 1.7 16.8 1.7 25.4s-.6 17.1-1.7 25.4l43.3 39.4c6.9 6.2 9.6 15.9 6.4 24.6c-4.4 11.9-9.7 23.3-15.8 34.3l-4.7 8.1c-6.6 11-14 21.4-22.1 31.2c-5.9 7.2-15.7 9.6-24.5 6.8l-55.7-17.7c-13.4 10.3-28.2 18.9-44 25.4l-12.5 57.1c-2 9.1-9 16.3-18.2 17.8c-13.8 2.3-28 3.5-42.5 3.5s-28.7-1.2-42.5-3.5c-9.2-1.5-16.2-8.7-18.2-17.8l-12.5-57.1c-15.8-6.5-30.6-15.1-44-25.4L83.1 425.9c-8.8 2.8-18.6 .3-24.5-6.8c-8.1-9.8-15.5-20.2-22.1-31.2l-4.7-8.1c-6.1-11-11.4-22.4-15.8-34.3c-3.2-8.7-.5-18.4 6.4-24.6l43.3-39.4C64.6 273.1 64 264.6 64 256s.6-17.1 1.7-25.4L22.4 191.2c-6.9-6.2-9.6-15.9-6.4-24.6c4.4-11.9 9.7-23.3 15.8-34.3l4.7-8.1c6.6-11 14-21.4 22.1-31.2c5.9-7.2 15.7-9.6 24.5-6.8l55.7 17.7c13.4-10.3 28.2-18.9 44-25.4l12.5-57.1c2-9.1 9-16.3 18.2-17.8C227.3 1.2 241.5 0 256 0s28.7 1.2 42.5 3.5c9.2 1.5 16.2 8.7 18.2 17.8l12.5 57.1c15.8 6.5 30.6 15.1 44 25.4l55.7-17.7c8.8-2.8 18.6-.3 24.5 6.8c8.1 9.8 15.5 20.2 22.1 31.2l4.7 8.1c6.1 11 11.4 22.4 15.8 34.3zM256 336a80 80 0 1 0 0-160 80 80 0 1 0 0 160z"/>
        </svg>
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
                            <div class="text-xs text-[#ffae00] font-bold tracking-[0.3em] mb-1">ONLINE</div>
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
                        <div class="font-mono text-[#ffae00] text-sm select-all" id="st-uid">---</div>
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
                            <div class="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#ffae00]"></div>
                        </label>
                    </div>

                    <div class="gn-slider-row">
                        <div class="flex justify-between mb-2">
                            <span class="text-sm text-gray-300 font-bold tracking-wider">MUSIC (BGM)</span>
                            <span id="vol-bgm-val" class="text-sm text-[#ffae00] font-mono">30%</span>
                        </div>
                        <input type="range" class="gn-range" min="0" max="1" step="0.01" id="vol-bgm" oninput="updateVol('bgm', this.value)">
                    </div>

                    <div class="gn-slider-row">
                        <div class="flex justify-between mb-2">
                            <span class="text-sm text-gray-300 font-bold tracking-wider">SOUND EFFECTS (SFX)</span>
                            <span id="vol-sfx-val" class="text-sm text-[#ffae00] font-mono">60%</span>
                        </div>
                        <input type="range" class="gn-range" min="0" max="1" step="0.01" id="vol-sfx" oninput="updateVol('sfx', this.value)">
                    </div>
                </div>

                <div id="tab-system" class="gn-tab-pane">
                    <h3 class="gn-section-title">SYSTEM PROTOCOLS</h3>
                    
                    <div class="grid gap-4">
                        <a href="tos.html" class="flex items-center p-4 border border-gray-800 bg-gray-900/50 hover:bg-gray-800 transition rounded-lg text-gray-300 no-underline group">
                            <i class="fa-solid fa-file-contract text-xl mr-4 text-gray-500 group-hover:text-[#ffae00]"></i>
                            <div>
                                <div class="font-bold text-white">Terms of Service</div>
                                <div class="text-xs text-gray-500">Review legal parameters</div>
                            </div>
                        </a>
                        <a href="privacy.html" class="flex items-center p-4 border border-gray-800 bg-gray-900/50 hover:bg-gray-800 transition rounded-lg text-gray-300 no-underline group">
                            <i class="fa-solid fa-shield-halved text-xl mr-4 text-gray-500 group-hover:text-[#ffae00]"></i>
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
    document.querySelectorAll('.gn-tab-btn').forEach(b => b.classList.remove('active'));
    event.currentTarget.classList.add('active'); 
    
    document.querySelectorAll('.gn-tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + tabName).classList.add('active');

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
