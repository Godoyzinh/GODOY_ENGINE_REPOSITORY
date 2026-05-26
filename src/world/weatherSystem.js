const WEATHER_STATES = {
  clear: 'clear',
  rain: 'rain',
  fog: 'fog',
};

const WEATHER_CHANGE_INTERVAL_SECONDS = 28;

export class WeatherSystem {
  constructor({ worldSeed }) {
    this.worldSeed = worldSeed;
    this.elapsedTime = 0;
    this.currentState = WEATHER_STATES.clear;
    this.intensity = 0;
    this.lastBiome = 'Plains';
    this.snapshot = this.createSnapshot();
  }

  update({ deltaTime, dayNightSnapshot, activeBiome }) {
    this.elapsedTime += deltaTime;
    this.lastBiome = activeBiome ?? this.lastBiome;
    const weatherRoll = getDeterministicRandom(`${this.worldSeed}:${this.lastBiome}:${getWeatherWindow(this.elapsedTime)}`);
    const isNight = dayNightSnapshot?.isNight === true;

    if (this.lastBiome === 'Desert') {
      this.currentState = weatherRoll > 0.78 ? WEATHER_STATES.fog : WEATHER_STATES.clear;
    } else if (weatherRoll > (isNight ? 0.62 : 0.72)) {
      this.currentState = WEATHER_STATES.rain;
    } else if (weatherRoll < 0.12) {
      this.currentState = WEATHER_STATES.fog;
    } else {
      this.currentState = WEATHER_STATES.clear;
    }

    this.intensity = this.resolveIntensity({ weatherRoll, isNight });
    this.snapshot = this.createSnapshot();
  }

  resolveIntensity({ weatherRoll, isNight }) {
    if (this.currentState === WEATHER_STATES.clear) {
      return 0;
    }

    const baseIntensity = this.currentState === WEATHER_STATES.rain ? 0.45 : 0.32;
    const nightBonus = isNight ? 0.16 : 0;

    return clamp01(baseIntensity + weatherRoll * 0.35 + nightBonus);
  }

  createSnapshot() {
    return {
      state: this.currentState,
      intensity: this.intensity,
      isRaining: this.currentState === WEATHER_STATES.rain,
      isFoggy: this.currentState === WEATHER_STATES.fog,
      ambience: getBiomeAmbience(this.lastBiome, this.currentState),
      fogMultiplier: this.currentState === WEATHER_STATES.fog
        ? 1 + this.intensity
        : 1 + this.intensity * 0.45,
      rainAudioReady: this.currentState === WEATHER_STATES.rain,
    };
  }

  getSnapshot() {
    return this.snapshot;
  }
}

function getWeatherWindow(elapsedTime) {
  return Math.floor(elapsedTime / WEATHER_CHANGE_INTERVAL_SECONDS);
}

function getBiomeAmbience(biomeName, weatherState) {
  if (weatherState === WEATHER_STATES.rain) {
    return `${biomeName} Rain`;
  }

  if (weatherState === WEATHER_STATES.fog) {
    return `${biomeName} Fog`;
  }

  return `${biomeName} Ambience`;
}

function getDeterministicRandom(seed) {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
}

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}
