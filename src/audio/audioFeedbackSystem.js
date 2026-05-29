const CUE_PROFILES = {
  footstep: {
    frequency: 118,
    duration: 0.045,
    type: 'triangle',
    gain: 0.055,
  },
  mining: {
    frequency: 190,
    duration: 0.08,
    type: 'square',
    gain: 0.045,
  },
  hit: {
    frequency: 86,
    duration: 0.1,
    type: 'sawtooth',
    gain: 0.052,
  },
  landing: {
    frequency: 72,
    duration: 0.11,
    type: 'triangle',
    gain: 0.058,
  },
  ui: {
    frequency: 420,
    duration: 0.045,
    type: 'sine',
    gain: 0.035,
  },
  ambient: {
    frequency: 164,
    duration: 0.16,
    type: 'sine',
    gain: 0.018,
  },
};

export class AudioFeedbackSystem {
  constructor() {
    this.volume = 0.75;
    this.audioContext = null;
    this.footstepTimer = 0;
    this.ambientTimer = 0;
    this.pendingCues = [];
    this.lastCue = 'none';
    this.snapshot = this.createSnapshot();
  }

  applySettings(settingsSnapshot) {
    this.volume = settingsSnapshot.audioVolume ?? this.volume;
  }

  update({
    deltaTime,
    playerController,
    weatherSnapshot = null,
    dayNightSnapshot = null,
    terrainStats = null,
  }) {
    this.updateFootsteps({ deltaTime, playerController });
    this.updateAmbientCue({ deltaTime, weatherSnapshot, dayNightSnapshot });
    this.snapshot = this.createSnapshot({
      cues: this.pendingCues,
      terrainStats,
      weatherSnapshot,
    });
    this.pendingCues = [];
  }

  updateFootsteps({ deltaTime, playerController }) {
    const movementSystem = playerController?.movementSystem;

    if (!movementSystem || !movementSystem.isGrounded || movementSystem.playerState.isFlying) {
      this.footstepTimer = 0;
      return;
    }

    const speed = movementSystem.horizontalVelocity.length();

    if (speed < 1.2) {
      this.footstepTimer = 0;
      return;
    }

    this.footstepTimer -= deltaTime;

    if (this.footstepTimer > 0) {
      return;
    }

    this.playCue('footstep');
    this.footstepTimer = clamp(0.48 - speed * 0.018, 0.2, 0.46);
  }

  updateAmbientCue({ deltaTime, weatherSnapshot, dayNightSnapshot }) {
    const isPressureCue = weatherSnapshot?.isRaining || weatherSnapshot?.isFoggy || dayNightSnapshot?.isNight;

    if (!isPressureCue) {
      this.ambientTimer = Math.max(0, this.ambientTimer - deltaTime * 0.25);
      return;
    }

    this.ambientTimer -= deltaTime;

    if (this.ambientTimer > 0) {
      return;
    }

    this.playCue('ambient');
    this.ambientTimer = weatherSnapshot?.isRaining ? 9 : 13;
  }

  playCue(cueId) {
    const profile = CUE_PROFILES[cueId];

    if (!profile) {
      return false;
    }

    this.pendingCues.push(cueId);
    this.lastCue = cueId;

    if (this.volume <= 0) {
      return false;
    }

    const audioContext = this.getAudioContext();

    if (!audioContext) {
      return false;
    }

    const resumePromise = audioContext.resume?.();

    resumePromise?.catch?.(() => {});

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const startTime = audioContext.currentTime;
    const endTime = startTime + profile.duration;

    oscillator.type = profile.type;
    oscillator.frequency.setValueAtTime(profile.frequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, profile.frequency * 0.72), endTime);
    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(profile.gain * this.volume, startTime + 0.008);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime);
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start(startTime);
    oscillator.stop(endTime);

    return true;
  }

  getAudioContext() {
    if (typeof window === 'undefined') {
      return null;
    }

    const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;

    if (!AudioContextConstructor) {
      return null;
    }

    if (!this.audioContext) {
      this.audioContext = new AudioContextConstructor();
    }

    return this.audioContext;
  }

  createSnapshot({ cues = [], terrainStats = null, weatherSnapshot = null } = {}) {
    return {
      lastCue: this.lastCue,
      pendingCues: [...new Set(cues)],
      volume: this.volume,
      proceduralAudioReady: this.audioContext !== null,
      biomeAmbience: `${(terrainStats?.activeBiome ?? 'plains').toLowerCase()}-procedural`,
      weatherCue: weatherSnapshot?.state ?? 'clear',
    };
  }

  getSnapshot() {
    return this.snapshot;
  }

  dispose() {
    this.audioContext?.close?.();
    this.audioContext = null;
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
