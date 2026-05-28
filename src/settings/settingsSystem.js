export const GRAPHICS_QUALITY = {
  low: 'low',
  medium: 'medium',
  high: 'high',
};

export const RENDER_DISTANCE_PRESETS = {
  near: 'near',
  balanced: 'balanced',
  far: 'far',
};

const STORAGE_KEY = 'godoyEngine.settings.v1';

const DEFAULT_SETTINGS = {
  graphicsQuality: GRAPHICS_QUALITY.medium,
  renderDistancePreset: RENDER_DISTANCE_PRESETS.balanced,
  audioVolume: 0.75,
  controlsHelp: true,
  debugOverlay: true,
  firstLaunchComplete: false,
};

const RENDER_DISTANCE_SETTINGS = {
  [RENDER_DISTANCE_PRESETS.near]: {
    loadRadius: 1,
    unloadRadius: 2,
    maxChunkLoadsPerFrame: 1,
    maxChunkUnloadsPerFrame: 2,
  },
  [RENDER_DISTANCE_PRESETS.balanced]: {
    loadRadius: 2,
    unloadRadius: 3,
    maxChunkLoadsPerFrame: 2,
    maxChunkUnloadsPerFrame: 2,
  },
  [RENDER_DISTANCE_PRESETS.far]: {
    loadRadius: 3,
    unloadRadius: 4,
    maxChunkLoadsPerFrame: 2,
    maxChunkUnloadsPerFrame: 3,
  },
};

const GRAPHICS_SETTINGS = {
  [GRAPHICS_QUALITY.low]: {
    maxPixelRatio: 1,
    shadows: false,
  },
  [GRAPHICS_QUALITY.medium]: {
    maxPixelRatio: 1.5,
    shadows: true,
  },
  [GRAPHICS_QUALITY.high]: {
    maxPixelRatio: 2,
    shadows: true,
  },
};

export class SettingsSystem {
  constructor({ storage = resolveStorage() } = {}) {
    this.storage = storage;
    this.settings = normalizeSettings(this.loadSettings());
    this.lastChangedAt = Date.now();
  }

  loadSettings() {
    const serializedSettings = this.storage.getItem(STORAGE_KEY);

    if (!serializedSettings) {
      return DEFAULT_SETTINGS;
    }

    try {
      return JSON.parse(serializedSettings);
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  updateSettings(partialSettings) {
    this.settings = normalizeSettings({
      ...this.settings,
      ...partialSettings,
    });
    this.lastChangedAt = Date.now();
    this.persist();

    return this.getSnapshot();
  }

  markFirstLaunchComplete() {
    return this.updateSettings({
      firstLaunchComplete: true,
    });
  }

  getRenderDistanceSettings() {
    return RENDER_DISTANCE_SETTINGS[this.settings.renderDistancePreset] ??
      RENDER_DISTANCE_SETTINGS[RENDER_DISTANCE_PRESETS.balanced];
  }

  getGraphicsSettings() {
    return GRAPHICS_SETTINGS[this.settings.graphicsQuality] ?? GRAPHICS_SETTINGS[GRAPHICS_QUALITY.medium];
  }

  getSnapshot() {
    return {
      ...this.settings,
      renderDistance: this.getRenderDistanceSettings(),
      graphics: this.getGraphicsSettings(),
      lastChangedAt: this.lastChangedAt,
    };
  }

  persist() {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
  }
}

function normalizeSettings(settings) {
  const sourceSettings = settings ?? DEFAULT_SETTINGS;

  return {
    ...DEFAULT_SETTINGS,
    ...sourceSettings,
    graphicsQuality: Object.values(GRAPHICS_QUALITY).includes(sourceSettings.graphicsQuality)
      ? sourceSettings.graphicsQuality
      : DEFAULT_SETTINGS.graphicsQuality,
    renderDistancePreset: Object.values(RENDER_DISTANCE_PRESETS).includes(sourceSettings.renderDistancePreset)
      ? sourceSettings.renderDistancePreset
      : DEFAULT_SETTINGS.renderDistancePreset,
    audioVolume: clamp(Number(sourceSettings.audioVolume ?? DEFAULT_SETTINGS.audioVolume), 0, 1),
    controlsHelp: sourceSettings.controlsHelp !== false,
    debugOverlay: sourceSettings.debugOverlay !== false,
    firstLaunchComplete: sourceSettings.firstLaunchComplete === true,
  };
}

function resolveStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }

  return createMemoryStorage();
}

function createMemoryStorage() {
  const entries = new Map();

  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  };
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
