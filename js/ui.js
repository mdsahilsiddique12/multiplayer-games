/**
 * UI SYSTEM CORE v2.0
 * Centralized interface for Toasts, Modals, Loading States, and Animations.
 */
(function() {
    // 1. INJECT GLOBAL STYLES
    const style = document.createElement('style');
    style.innerHTML = `
        /* --- TOASTS --- */
        #gn-toast-container {
            position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
            z-index: 20000; display: flex; flex-direction: column; gap: 10px;
            pointer-events: none; width: 90%; max-width: 400px;
        }
        .gn-toast {
            background: rgba(5, 5, 16, 0.95); border-left: 4px solid #00f3ff;
            border: 1px solid rgba(255,255,255,0.1); color: #fff;
            padding: 14px 20px; border-radius: 4px; font-family: 'Rajdhani', sans-serif;
            box-shadow: 0 5px 20px rgba(0,0,0,0.5); display: flex; align-items: center; gap: 15px;
            opacity: 0; transform: translateY(20px); transition: 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
            backdrop-filter: blur(8px); overflow: hidden; pointer-events: auto;
        }
        .gn-toast.show { opacity: 1; transform: translateY(0); }
        .gn-toast.success { border-color: #0aff0a; } .gn-toast.success i { color: #0aff0a; }
        .gn-toast.error { border-color: #ff003c; } .gn-toast.error i { color: #ff003c; }
        
        /* --- GLOBAL OVERLAY (Backdrop) --- */
        .gn-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(5px);
            z-index: 15000; display: none; align-items: center; justify-content: center;
            animation: fadeIn 0.2s ease-out;
        }

        /* --- MODAL BOX --- */
        .gn-modal-box {
            background: #050510; border: 2px solid #333; width: 90%; max-width: 500px;
            padding: 30px; text-align: center; position: relative;
            box-shadow: 0 0 50px rgba(0,0,0,0.8); transform: scale(0.95);
            transition: 0.2s; animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
        .gn-modal-box::before { /* Corner accent */
            content:''; position: absolute; top:-2px; left:-2px; width:15px; height:15px; 
            border-top:2px solid #00f3ff; border-left:2px solid #00f3ff;
        }
        .gn-modal-title { font-family: 'Orbitron', sans-serif; font-size: 1.5rem; color: #fff; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 2px; border-bottom: 1px solid #333; padding-bottom: 10px; }
        .gn-modal-body { font-family: 'Rajdhani', sans-serif; color: #ccc; margin-bottom: 25px; line-height: 1.5; font-size: 1rem; text-align: left; }
        .gn-modal-actions { display: flex; gap: 15px; justify-content: center; margin-top: 20px; }
        
        /* Buttons */
        .gn-btn {
            padding: 10px 25px; border: 1px solid #444; background: transparent;
            color: #ccc; font-family: 'Orbitron', sans-serif; cursor: pointer;
            transition: 0.2s; text-transform: uppercase; letter-spacing: 1px;
        }
        .gn-btn:hover { background: #fff; color: #000; }
        .gn-btn.primary { border-color: #00f3ff; color: #00f3ff; box-shadow: 0 0 15px rgba(0, 243, 255, 0.1); }
        .gn-btn.primary:hover { background: #00f3ff; color: #000; box-shadow: 0 0 30px rgba(0, 243, 255, 0.4); }
        .gn-btn.danger { border-color: #ff003c; color: #ff003c; }
        .gn-btn.danger:hover { background: #ff003c; color: #fff; box-shadow: 0 0 30px rgba(255, 0, 60, 0.4); }

        /* --- LEVEL UP OVERLAY --- */
        #gn-levelup-container {
            position: fixed; inset: 0; z-index: 16000; display: none;
            flex-direction: column; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.92);
        }
        .levelup-title {
            font-family: 'Black Ops One', cursive; font-size: 4rem; color: #ffd700;
            text-shadow: 0 0 30px rgba(255, 215, 0, 0.6); margin-bottom: 0;
            animation: glitch 1s infinite alternate;
        }
        .levelup-num {
            font-family: 'Orbitron', sans-serif; font-size: 8rem; font-weight: 900;
            background: linear-gradient(to bottom, #fff, #888); -webkit-background-clip: text; color: transparent;
            margin: -20px 0; filter: drop-shadow(0 0 20px rgba(0, 243, 255, 0.5));
        }
        .levelup-rewards {
            margin-top: 30px; padding: 15px 30px; border: 1px solid #00f3ff;
            background: rgba(0, 243, 255, 0.1); color: #00f3ff; font-family: 'Share Tech Mono', monospace;
            font-size: 1.2rem; letter-spacing: 2px;
        }

        /* --- UTILS --- */
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes popIn { from{transform:scale(0.8); opacity:0} to{transform:scale(1); opacity:1} }
        @keyframes spin { to { transform: rotate(360deg); } }
        .gn-spinner {
            width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3);
            border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite;
            display: inline-block; margin-right: 8px; vertical-align: middle;
        }
    `;
    document.head.appendChild(style);

    // 2. CREATE STATIC ELEMENTS
    const toastContainer = document.createElement('div');
    toastContainer.id = 'gn-toast-container';
    document.body.appendChild(toastContainer);

    const overlay = document.createElement('div');
    overlay.className = 'gn-overlay';
    overlay.innerHTML = `
        <div class="gn-modal-box">
            <div class="gn-modal-title" id="gn-m-title">ALERT</div>
            <div class="gn-modal-body" id="gn-m-body">...</div>
            <div class="gn-modal-actions" id="gn-m-actions"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    const levelUpDiv = document.createElement('div');
    levelUpDiv.id = 'gn-levelup-container';
    levelUpDiv.innerHTML = `
        <div class="levelup-title">SYSTEM UPGRADE</div>
        <div class="levelup-num" id="gn-lvl-num">2</div>
        <div style="color:#aaa; font-family:'Rajdhani'; letter-spacing:5px;">ACCESS LEVEL INCREASED</div>
        <div class="levelup-rewards" id="gn-lvl-reward">REWARD: 500 CR</div>
        <button class="gn-btn primary" style="margin-top:40px; width:200px;" onclick="document.getElementById('gn-levelup-container').style.display='none'">ACKNOWLEDGE</button>
    `;
    document.body.appendChild(levelUpDiv);

    const loader = document.createElement('div');
    loader.id = 'gn-global-loader';
    loader.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:20000;display:none;align-items:center;justify-content:center;flex-direction:column;";
    loader.innerHTML = `<div style="width:50px;height:50px;border:3px solid #00f3ff;border-top-color:transparent;border-radius:50%;animation:spin 1s infinite linear;"></div><div style="margin-top:15px;color:#fff;font-family:'Orbitron';letter-spacing:2px;" id="gn-loader-text">LOADING...</div>`;
    document.body.appendChild(loader);

    // ================= EXPOSED API =================

    // 1. TOASTS
    window.showToast = function(msg, type = 'info') {
        const t = document.createElement('div');
        t.className = `gn-toast ${type}`;
        let icon = type === 'success' ? 'fa-check' : type === 'error' ? 'fa-triangle-exclamation' : 'fa-info-circle';
        t.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${msg}</span>`;
        toastContainer.appendChild(t);
        requestAnimationFrame(() => t.classList.add('show'));
        setTimeout(() => {
            t.classList.remove('show');
            setTimeout(() => t.remove(), 300);
        }, 3000);
    };

    // 2. CONFIRM ACTION MODAL
    window.confirmAction = function(title, message, onConfirm, isDanger = false) {
        document.getElementById('gn-m-title').innerText = title;
        document.getElementById('gn-m-body').innerText = message;
        
        const actions = document.getElementById('gn-m-actions');
        actions.innerHTML = '';

        const btnCancel = document.createElement('button');
        btnCancel.className = 'gn-btn';
        btnCancel.innerText = 'CANCEL';
        btnCancel.onclick = () => { overlay.style.display = 'none'; };

        const btnOk = document.createElement('button');
        btnOk.className = `gn-btn ${isDanger ? 'danger' : 'primary'}`;
        btnOk.innerText = isDanger ? 'EXECUTE' : 'CONFIRM';
        btnOk.onclick = () => {
            overlay.style.display = 'none';
            if (onConfirm) onConfirm();
        };

        actions.appendChild(btnCancel);
        actions.appendChild(btnOk);
        overlay.style.display = 'flex';
    };

    // 3. SHOW CUSTOM HTML MODAL (For History, Feedback, etc.)
    window.showCustomModal = function(title, htmlContent) {
        document.getElementById('gn-m-title').innerText = title;
        document.getElementById('gn-m-body').innerHTML = htmlContent;
        document.getElementById('gn-m-actions').innerHTML = ''; // Clear default buttons
        overlay.style.display = 'flex';
    };

    window.closeModal = function() {
        overlay.style.display = 'none';
    };

    // 4. LEVEL UP SCREEN
    window.showLevelUp = function(level, bonus) {
        document.getElementById('gn-lvl-num').innerText = level;
        document.getElementById('gn-lvl-reward').innerText = `BONUS REWARD: +${bonus} CR`;
        levelUpDiv.style.display = 'flex';
    };

    // 5. BUTTON LOADING STATE
    window.setBtnLoading = function(btnId, isLoading, loadingText = "PROCESSING...") {
        const btn = typeof btnId === 'string' ? document.getElementById(btnId) : btnId;
        if(!btn) return;

        if(isLoading) {
            btn.dataset.originalText = btn.innerText;
            btn.innerHTML = `<span class="gn-spinner"></span> ${loadingText}`;
            btn.disabled = true;
            btn.style.opacity = '0.7';
        } else {
            btn.innerText = btn.dataset.originalText || "SUBMIT";
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    };

    // 6. GLOBAL LOADER
    window.showLoading = (text="PROCESSING DATA...") => {
        document.getElementById('gn-loader-text').innerText = text;
        loader.style.display = 'flex';
    };
    window.hideLoading = () => { loader.style.display = 'none'; };

})();
