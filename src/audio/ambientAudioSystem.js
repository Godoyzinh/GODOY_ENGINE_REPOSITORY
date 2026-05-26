const SURVIVAL_SOUND_EVENTS = {
  hungry: 'survival:hunger-low',
  hurt: 'survival:hurt',
  rain: 'weather:rain-loop',
  fog: 'weather:fog-bed',
  night: 'world:night-pressure',
};

export class AmbientAudioSystem {
  constructor() {
    this.lastSurvivalEvent = null;
    this.lastCombatEvent = null;
    this.pendingCues = [];
    this.snapshot = this.createSnapshot();
  }

  update({
    weatherSnapshot,
    dayNightSnapshot,
    terrainStats,
    survivalSnapshot,
    combatSnapshot,
  }) {
    this.pendingCues = [];
    this.collectWeatherCues(weatherSnapshot);
    this.collectSurvivalCues(survivalSnapshot);
    this.collectCombatCues(combatSnapshot);
    this.snapshot = this.createSnapshot({
      weatherSnapshot,
      dayNightSnapshot,
      terrainStats,
      survivalSnapshot,
    });
  }

  collectWeatherCues(weatherSnapshot) {
    if (weatherSnapshot?.isRaining) {
      this.pendingCues.push(SURVIVAL_SOUND_EVENTS.rain);
    } else if (weatherSnapshot?.isFoggy) {
      this.pendingCues.push(SURVIVAL_SOUND_EVENTS.fog);
    }
  }

  collectSurvivalCues(survivalSnapshot) {
    if (!survivalSnapshot) {
      return;
    }

    if (survivalSnapshot.hunger <= 20) {
      this.pendingCues.push(SURVIVAL_SOUND_EVENTS.hungry);
    }

    if (survivalSnapshot.lastEvent !== this.lastSurvivalEvent && survivalSnapshot.lastEvent.includes('-')) {
      this.pendingCues.push(SURVIVAL_SOUND_EVENTS.hurt);
    }

    this.lastSurvivalEvent = survivalSnapshot.lastEvent;
  }

  collectCombatCues(combatSnapshot) {
    const attackState = combatSnapshot?.lastAttack?.state;

    if (attackState && attackState !== this.lastCombatEvent && ['hit', 'miss', 'cooldown'].includes(attackState)) {
      this.pendingCues.push(`combat:${attackState}`);
    }

    this.lastCombatEvent = attackState;
  }

  createSnapshot({
    weatherSnapshot = null,
    dayNightSnapshot = null,
    terrainStats = null,
    survivalSnapshot = null,
  } = {}) {
    const biomeName = terrainStats?.activeBiome ?? 'Plains';
    const ambientLayer = weatherSnapshot?.ambience ?? `${biomeName} Ambience`;
    const pressureLayer = dayNightSnapshot?.isNight ? SURVIVAL_SOUND_EVENTS.night : 'world:day-calm';

    return {
      ambientLayer,
      pressureLayer,
      weatherAudioReady: weatherSnapshot?.rainAudioReady === true || weatherSnapshot?.isFoggy === true,
      biomeAmbience: `${biomeName.toLowerCase()}-ambience`,
      survivalFeedbackReady: survivalSnapshot?.health < survivalSnapshot?.maxHealth || survivalSnapshot?.hunger <= 35,
      pendingCues: [...new Set(this.pendingCues)],
      hookCount: 4,
    };
  }

  getSnapshot() {
    return this.snapshot;
  }
}
