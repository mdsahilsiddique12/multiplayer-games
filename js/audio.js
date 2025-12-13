/**
 * Audio Manager (Sonic Core) v2.0
 * Supports dynamic volume control and settings persistence.
 */
const SonicCore = {
    bgm: null,
    muted: localStorage.getItem('gn_muted') === 'true',
    // Default volumes or load from storage
    bgmVolume: parseFloat(localStorage.getItem('gn_vol_bgm') || 0.09),
    sfxVolume: parseFloat(localStorage.getItem('gn_vol_sfx') || 0.6),

    sounds: {
        click: new Audio('sounds/bubble.mp3'),
        success: new Audio('sounds/sabash.mp3'),
        error: new Audio('sounds/failure.mp3'),
        // Your 1-hour BGM link
        bgm: new Audio('https://github.com/mdsahilsiddique12/multiplayer-games/releases/download/v1.0-audio/Black.Swan.-.Quincas.Moreira.mp3')
    },

    init: function() {
        if(this.sounds.bgm) {
            this.sounds.bgm.loop = true;
            this.sounds.bgm.volume = this.bgmVolume;
        }

        // Apply Mute State
        this.applyState();

        // Autoplay Logic
        if (!this.muted) {
            setTimeout(() => this.attemptAutoplay(), 1000);
        }

        // Global Click Listener for SFX
        document.addEventListener('click', (e) => {
            if(e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.closest('.card') || e.target.closest('.clickable')) {
                this.play('click');
            }
        });
        
        console.log("SonicCore v2 Initialized");
    },

    attemptAutoplay: function() {
        if(this.muted || !this.sounds.bgm) return;
        const playPromise = this.sounds.bgm.play();
        if (playPromise !== undefined) {
            playPromise.catch(() => {
                console.log("Autoplay blocked. Waiting for interaction.");
                document.addEventListener('click', () => this.startBGM(), { once: true });
            });
        }
    },

    play: function(key) {
        if(this.muted) return;
        if(this.sounds[key] && key !== 'bgm') {
            const sfx = this.sounds[key].cloneNode();
            sfx.volume = this.sfxVolume;
            sfx.play().catch(() => {});
        }
    },

    startBGM: function() {
        if(this.muted || !this.sounds.bgm) return;
        this.sounds.bgm.volume = this.bgmVolume;
        this.sounds.bgm.play().catch(e => console.log("BGM wait..."));
    },

    // --- NEW SETTINGS FUNCTIONS ---

    setBGMVolume: function(val) {
        this.bgmVolume = parseFloat(val);
        localStorage.setItem('gn_vol_bgm', this.bgmVolume);
        if(this.sounds.bgm) this.sounds.bgm.volume = this.bgmVolume;
    },

    setSFXVolume: function(val) {
        this.sfxVolume = parseFloat(val);
        localStorage.setItem('gn_vol_sfx', this.sfxVolume);
    },

    toggleMute: function(forceState = null) {
        this.muted = forceState !== null ? forceState : !this.muted;
        localStorage.setItem('gn_muted', this.muted);
        this.applyState();
        return this.muted;
    },

    applyState: function() {
        if(!this.sounds.bgm) return;
        if(this.muted) {
            this.sounds.bgm.pause();
        } else {
            this.startBGM();
        }
    }
};

document.addEventListener('DOMContentLoaded', () => SonicCore.init());
