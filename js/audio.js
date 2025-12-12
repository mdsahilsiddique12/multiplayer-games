/**
 * Audio Manager (Sonic Core)
 * Handles Background Music (BGM) and UI Click Sounds
 */
const SonicCore = {
    bgm: null,
    muted: localStorage.getItem('gn_muted') === 'true',
    
    // Sounds Configuration
    sounds: {
        click: new Audio('sounds/bubble.mp3'),
        success: new Audio('sounds/sabash.mp3'),
        error: new Audio('sounds/failure.mp3'),

        // YOUR GITHUB RELEASE LINK
        bgm: new Audio('https://github.com/mdsahilsiddique12/multiplayer-games/releases/download/v1.0-audio/Black.Swan.-.Quincas.Moreira.mp3')
    },

    init: function() {
        // Setup BGM
        if(this.sounds.bgm) {
            this.sounds.bgm.loop = true;
            this.sounds.bgm.volume = 0.01; // Low volume for background ambience
        }

        if(this.sounds.click) {
            this.sounds.bgm.volume = 0.05; // Low volume for background ambience
        }
        // 1. Check if user previously muted
        if (this.muted) {
            console.log("Audio initialized in MUTED state.");
        } else {
            // 2. Try to play automatically after 1 second
            setTimeout(() => {
                this.attemptAutoplay();
            }, 1000);
        }

        // Attach Click Sound to ALL buttons automatically
        document.addEventListener('click', (e) => {
            if(e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.closest('.card')) {
                this.play('click');
            }
        });
        
        console.log("SonicCore Initialized");
    },

    attemptAutoplay: function() {
        if(this.muted || !this.sounds.bgm) return;

        // Try to play immediately
        const playPromise = this.sounds.bgm.play();

        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.log("Autoplay blocked by browser. Waiting for first interaction...");
                
                // 3. Fallback: Add a one-time listener to the entire document
                // The moment the user clicks ANYWHERE, the music will start.
                document.addEventListener('click', () => {
                    this.startBGM();
                }, { once: true });
            });
        }
    },

    play: function(key) {
        if(this.muted) return;
        
        // We generally don't use this function for BGM, only SFX
        if(key !== 'bgm' && this.sounds[key]) {
            // Clone node to allow overlapping sounds (e.g. rapid clicking)
            const sfx = this.sounds[key].cloneNode();
            sfx.volume = 0.6; // SFX volume
            sfx.play().catch(() => {}); 
        }
    },

    startBGM: function() {
        if(this.muted || !this.sounds.bgm) return;
        
        // Play and catch potential errors (like if user still hasn't interacted)
        this.sounds.bgm.play().catch(e => console.log("BGM start pending interaction..."));
    },

    toggleMute: function() {
        this.muted = !this.muted;
        localStorage.setItem('gn_muted', this.muted);
        this.applyMuteState();
        return this.muted;
    },

    applyMuteState: function() {
        if(!this.sounds.bgm) return;

        if(this.muted) {
            this.sounds.bgm.pause();
        } else {
            this.startBGM();
        }
    }
};

// Initialize automatically when the page loads
document.addEventListener('DOMContentLoaded', () => SonicCore.init());
