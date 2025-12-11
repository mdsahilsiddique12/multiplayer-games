/**
 * Game Nexus UI Manager
 * Handles Toasts, Modals, and overrides native browser alerts.
 */

(function() {
    // =========================================
    // 1. INJECT STYLES (Cyberpunk Theme)
    // =========================================
    const style = document.createElement('style');
    style.innerHTML = `
        /* Toast Container */
        #gn-toast-container {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 12px;
            pointer-events: none; /* Let clicks pass through */
            width: 90%;
            max-width: 400px;
        }

        /* Toast Item */
        .gn-toast {
            background: rgba(5, 5, 16, 0.95);
            border-left: 4px solid var(--neon-blue, #00f3ff);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #fff;
            padding: 14px 20px;
            border-radius: 4px;
            font-family: 'Rajdhani', sans-serif;
            font-size: 1rem;
            letter-spacing: 1px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            gap: 15px;
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            pointer-events: auto;
            backdrop-filter: blur(5px);
            position: relative;
            overflow: hidden;
        }

        /* Entry Animation Class */
        .gn-toast.show {
            opacity: 1;
            transform: translateY(0);
        }

        /* Scanline Effect */
        .gn-toast::after {
            content: '';
            position: absolute;
            top: 0; left: 0; width: 100%; height: 2px;
            background: rgba(255, 255, 255, 0.1);
            animation: toastScan 2s linear infinite;
        }

        @keyframes toastScan { 0% { top: 0; } 100% { top: 100%; } }

        /* Types */
        .gn-toast.success { border-left: 4px solid #0aff0a; box-shadow: 0 0 10px rgba(10, 255, 10, 0.15); }
        .gn-toast.error   { border-left: 4px solid #ff003c; box-shadow: 0 0 10px rgba(255, 0, 60, 0.15); }
        .gn-toast.warning { border-left: 4px solid #ffd700; box-shadow: 0 0 10px rgba(255, 215, 0, 0.15); }
        .gn-toast.info    { border-left: 4px solid #00f3ff; box-shadow: 0 0 10px rgba(0, 243, 255, 0.15); }

        /* Icon styling */
        .gn-toast-icon { font-size: 1.2rem; }
        .gn-toast.success .gn-toast-icon { color: #0aff0a; }
        .gn-toast.error .gn-toast-icon   { color: #ff003c; }
        .gn-toast.warning .gn-toast-icon { color: #ffd700; }
        .gn-toast.info .gn-toast-icon    { color: #00f3ff; }
    `;
    document.head.appendChild(style);

    // =========================================
    // 2. CREATE CONTAINER
    // =========================================
    const container = document.createElement('div');
    container.id = 'gn-toast-container';
    document.body.appendChild(container);

    // =========================================
    // 3. TOAST LOGIC
    // =========================================
    window.showToast = function(message, type = 'info') {
        // Create elements
        const toast = document.createElement('div');
        toast.className = `gn-toast ${type}`;

        // Icons based on type
        let iconHtml = '<i class="fa-solid fa-circle-info"></i>'; // Default
        if (type === 'success') iconHtml = '<i class="fa-solid fa-check-circle"></i>';
        if (type === 'error')   iconHtml = '<i class="fa-solid fa-triangle-exclamation"></i>';
        if (type === 'warning') iconHtml = '<i class="fa-solid fa-bolt"></i>';

        toast.innerHTML = `
            <span class="gn-toast-icon">${iconHtml}</span>
            <span>${message}</span>
        `;

        // Add to DOM
        container.appendChild(toast);

        // Animate In (small delay to allow DOM render)
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Play Sound (Optional - very quiet blip)
        try {
            // const audio = new Audio('sounds/bubble.mp3'); 
            // audio.volume = 0.2;
            // audio.play().catch(() => {});
        } catch(e) {}

        // Remove after 3.5 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            toast.style.opacity = '0';
            // Wait for fade out transition before removing from DOM
            setTimeout(() => {
                if(toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, 3500);
    };

    // =========================================
    // 4. OVERRIDE NATIVE ALERT
    // =========================================
    // This ensures existing code in rmcs.js / detective.js works without changes.
    const originalAlert = window.alert;
    
    window.alert = function(message) {
        // Simple heuristic to guess type based on message content
        const lowerMsg = String(message).toLowerCase();
        let type = 'info';

        if (lowerMsg.includes('error') || lowerMsg.includes('fail') || lowerMsg.includes('denied')) {
            type = 'error';
        } else if (lowerMsg.includes('success') || lowerMsg.includes('copied') || lowerMsg.includes('welcome')) {
            type = 'success';
        } else if (lowerMsg.includes('warning') || lowerMsg.includes('required') || lowerMsg.includes('missing')) {
            type = 'warning';
        }

        window.showToast(message, type);
        console.log(`[System Alert]: ${message}`); // Log it just in case
    };

    // =========================================
    // 5. GLOBAL LOADER (Add this to ui.js)
    // =========================================
    const loaderStyle = document.createElement('style');
    loaderStyle.innerHTML = `
        #gn-global-loader {
            position: fixed; inset: 0; 
            background: rgba(0, 0, 0, 0.85); 
            backdrop-filter: blur(8px);
            z-index: 20000;
            display: none; justify-content: center; align-items: center; flex-direction: column;
        }
        .cyber-spinner {
            width: 50px; height: 50px;
            border: 3px solid transparent;
            border-top: 3px solid var(--neon-blue, #00f3ff);
            border-right: 3px solid var(--neon-blue, #00f3ff);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            box-shadow: 0 0 15px var(--neon-blue, #00f3ff);
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .loader-text {
            margin-top: 15px; font-family: 'Orbitron', sans-serif; 
            color: #fff; letter-spacing: 2px; font-size: 0.9rem;
            animation: pulseText 1.5s infinite;
        }
        @keyframes pulseText { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    `;
    document.head.appendChild(loaderStyle);

    // Create Loader Elements
    const loaderContainer = document.createElement('div');
    loaderContainer.id = 'gn-global-loader';
    loaderContainer.innerHTML = `
        <div class="cyber-spinner"></div>
        <div class="loader-text" id="gn-loader-text">PROCESSING DATA...</div>
    `;
    document.body.appendChild(loaderContainer);

    // Expose Functions
    window.showLoading = function(text = "PROCESSING...") {
        document.getElementById('gn-loader-text').innerText = text;
        document.getElementById('gn-global-loader').style.display = 'flex';
    };

    window.hideLoading = function() {
        document.getElementById('gn-global-loader').style.display = 'none';
    };

})();
