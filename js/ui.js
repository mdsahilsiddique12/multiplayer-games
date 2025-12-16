/**
 * UI SYSTEM CORE v2.0
 * Centralized UI for Toasts, Modals, Loaders, Buttons, and Overlays
 * Backward compatible with RMCS & other multiplayer-games
 */

(function () {
  /* ============================================================
     1. GLOBAL STYLE INJECTION
  ============================================================ */
  const style = document.createElement("style");
  style.innerHTML = `
  /* --- TOASTS --- */
  #gn-toast-container {
    position: fixed;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20000;
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: none;
    width: 90%;
    max-width: 420px;
  }
  .gn-toast {
    background: rgba(5,5,16,0.95);
    border-left: 4px solid #00f3ff;
    border: 1px solid rgba(255,255,255,0.1);
    color: #fff;
    padding: 14px 18px;
    font-family: 'Rajdhani', sans-serif;
    box-shadow: 0 5px 20px rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    gap: 12px;
    opacity: 0;
    transform: translateY(20px);
    transition: all .3s ease;
    pointer-events: auto;
  }
  .gn-toast.show { opacity:1; transform:translateY(0); }
  .gn-toast.success { border-color:#00ff7f; }
  .gn-toast.error { border-color:#ff003c; }
  .gn-toast.info { border-color:#00f3ff; }

  /* --- OVERLAY / MODAL --- */
  .gn-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.85);
    backdrop-filter: blur(5px);
    z-index: 15000;
    display: none;
    align-items: center;
    justify-content: center;
  }
  .gn-modal-box {
    background:#050510;
    border:2px solid #333;
    width:90%;
    max-width:520px;
    padding:28px;
    box-shadow:0 0 40px rgba(0,0,0,.9);
    animation: pop .25s ease forwards;
  }
  @keyframes pop {
    from { transform:scale(.9); opacity:0 }
    to { transform:scale(1); opacity:1 }
  }
  .gn-modal-title {
    font-family:'Orbitron',sans-serif;
    font-size:1.4rem;
    color:#fff;
    border-bottom:1px solid #333;
    padding-bottom:10px;
    margin-bottom:15px;
  }
  .gn-modal-body {
    font-family:'Rajdhani',sans-serif;
    color:#ccc;
    font-size:1rem;
    line-height:1.5;
  }
  .gn-modal-actions {
    display:flex;
    justify-content:center;
    gap:15px;
    margin-top:25px;
  }

  /* --- BUTTONS --- */
  .gn-btn {
    padding:10px 24px;
    border:1px solid #555;
    background:transparent;
    color:#ccc;
    font-family:'Orbitron';
    cursor:pointer;
    transition:.2s;
  }
  .gn-btn.primary { border-color:#00f3ff; color:#00f3ff; }
  .gn-btn.danger { border-color:#ff003c; color:#ff003c; }
  .gn-btn:hover { background:#fff; color:#000; }

  /* --- LOADER --- */
  #gn-global-loader {
    position:fixed;
    inset:0;
    background:rgba(0,0,0,.9);
    z-index:20000;
    display:none;
    align-items:center;
    justify-content:center;
    flex-direction:column;
  }
  .gn-spinner {
    width:46px;
    height:46px;
    border:3px solid #00f3ff;
    border-top-color:transparent;
    border-radius:50%;
    animation:spin 1s linear infinite;
  }
  @keyframes spin { to { transform:rotate(360deg) } }

  /* --- LEVEL UP --- */
  #gn-levelup {
    position:fixed;
    inset:0;
    display:none;
    align-items:center;
    justify-content:center;
    flex-direction:column;
    background:rgba(0,0,0,.92);
    z-index:18000;
  }
  `;
  document.head.appendChild(style);

  /* ============================================================
     2. STATIC DOM ELEMENTS
  ============================================================ */
  const toastContainer = document.createElement("div");
  toastContainer.id = "gn-toast-container";
  document.body.appendChild(toastContainer);

  const overlay = document.createElement("div");
  overlay.className = "gn-overlay";
  overlay.innerHTML = `
    <div class="gn-modal-box">
      <div class="gn-modal-title" id="gn-m-title"></div>
      <div class="gn-modal-body" id="gn-m-body"></div>
      <div class="gn-modal-actions" id="gn-m-actions"></div>
    </div>`;
  document.body.appendChild(overlay);

  const loader = document.createElement("div");
  loader.id = "gn-global-loader";
  loader.innerHTML = `
    <div class="gn-spinner"></div>
    <div id="gn-loader-text" style="margin-top:15px;color:#fff;font-family:'Orbitron'">LOADING...</div>`;
  document.body.appendChild(loader);

  const levelUp = document.createElement("div");
  levelUp.id = "gn-levelup";
  levelUp.innerHTML = `
    <h1 style="color:#ffd700;font-family:'Orbitron'">LEVEL UP</h1>
    <h2 id="gn-lvl-num" style="color:#00f3ff;font-size:4rem"></h2>
    <p id="gn-lvl-reward" style="color:#ccc"></p>
    <button class="gn-btn primary" style="margin-top:25px">CONTINUE</button>`;
  document.body.appendChild(levelUp);
  levelUp.querySelector("button").onclick = () => levelUp.style.display = "none";

  /* ============================================================
     3. EXPOSED API (STABLE)
  ============================================================ */

  /* --- TOAST --- */
  window.showToast = function (msg, type = "info") {
    const t = document.createElement("div");
    t.className = `gn-toast ${type}`;
    t.innerHTML = `<span>${msg}</span>`;
    toastContainer.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 300);
    }, 3000);
  };

  /* --- CONFIRM MODAL --- */
  window.confirmAction = function (title, message, onConfirm, danger = false) {
    document.getElementById("gn-m-title").innerText = title;
    document.getElementById("gn-m-body").innerText = message;

    const actions = document.getElementById("gn-m-actions");
    actions.innerHTML = "";

    const cancel = document.createElement("button");
    cancel.className = "gn-btn";
    cancel.innerText = "CANCEL";
    cancel.onclick = () => overlay.style.display = "none";

    const ok = document.createElement("button");
    ok.className = `gn-btn ${danger ? "danger" : "primary"}`;
    ok.innerText = danger ? "EXECUTE" : "CONFIRM";
    ok.onclick = () => {
      overlay.style.display = "none";
      onConfirm && onConfirm();
    };

    actions.append(cancel, ok);
    overlay.style.display = "flex";
  };

  /* --- CUSTOM MODAL --- */
  window.showCustomModal = function (title, html) {
    document.getElementById("gn-m-title").innerText = title;
    document.getElementById("gn-m-body").innerHTML = html;
    document.getElementById("gn-m-actions").innerHTML = "";
    overlay.style.display = "flex";
  };

  window.closeModal = () => overlay.style.display = "none";

  /* --- LEVEL UP --- */
  window.showLevelUp = function (level, reward) {
    document.getElementById("gn-lvl-num").innerText = `LEVEL ${level}`;
    document.getElementById("gn-lvl-reward").innerText = `BONUS: +${reward} CR`;
    levelUp.style.display = "flex";
  };

  /* --- BUTTON LOADING --- */
  window.setBtnLoading = function (btn, state, text = "PROCESSING...") {
    const b = typeof btn === "string" ? document.getElementById(btn) : btn;
    if (!b) return;
    if (state) {
      b.dataset.txt = b.innerText;
      b.innerHTML = `<span class="gn-spinner" style="width:14px;height:14px"></span> ${text}`;
      b.disabled = true;
    } else {
      b.innerText = b.dataset.txt || "SUBMIT";
      b.disabled = false;
    }
  };

  /* --- GLOBAL LOADER --- */
  window.showLoading = (txt = "PROCESSING...") => {
    document.getElementById("gn-loader-text").innerText = txt;
    loader.style.display = "flex";
  };
  window.hideLoading = () => loader.style.display = "none";

})();
