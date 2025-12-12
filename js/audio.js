const SonicCore = {
    bgm: null,
    muted: localStorage.getItem('gn_muted') === 'true',
    
    // Sounds (Replace these URLs with your actual file paths)
    sounds: {
        click: new Audio('sounds/bubble.mp3'), // You already reference this in rmcs.js
        success: new Audio('sounds/sabash.mp3'),
        error: new Audio('sounds/failure.mp3'),
        bgm: new Audio('https://res.cloudinary.com/derz1fxtd/video/upload/v1765544812/pgJarEKvDpM_kafpsl.mp3')
    },

    init: function() {
        // Setup BGM
        this.sounds.bgm.loop = true;
        this.sounds.bgm.volume = 0.3; // Low volume for background

        // Apply Mute State
        this.applyMuteState();

        // Attach Click Sound to ALL buttons automatically
        document.addEventListener('click', (e) => {
            if(e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.closest('.card')) {
                this.play('click');
            }
        });
        
        console.log("SonicCore Initialized");
    },

    play: function(key) {
        if(this.muted) return;
        if(this.sounds[key]) {
            // Clone node to allow overlapping sounds (rapid clicking)
            const sfx = this.sounds[key].cloneNode();
            sfx.volume = (key === 'bgm') ? 0.3 : 0.6;
            sfx.play().catch(() => {}); // Catch error if user hasn't interacted yet
        }
    },

    startBGM: function() {
        if(this.muted) return;
        // user interaction check usually required by browsers
        this.sounds.bgm.play().catch(() => console.log("Waiting for interaction to play BGM"));
    },

    toggleMute: function() {
        this.muted = !this.muted;
        localStorage.setItem('gn_muted', this.muted);
        this.applyMuteState();
        return this.muted;
    },

    applyMuteState: function() {
        if(this.muted) {
            this.sounds.bgm.pause();
        } else {
            this.startBGM();
        }
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => SonicCore.init());
