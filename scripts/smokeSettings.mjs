import assert from 'node:assert/strict';
import { GRAPHICS_QUALITY, RENDER_DISTANCE_PRESETS, SettingsSystem } from '../src/settings/settingsSystem.js';

const storage = createMemoryStorage();
const settingsSystem = new SettingsSystem({ storage });
const defaultSettings = settingsSystem.getSnapshot();

assert.equal(defaultSettings.debugOverlay, false);
assert.equal(defaultSettings.controlsHelp, true);
assert.equal(defaultSettings.settingsVersion, 2);

settingsSystem.updateSettings({
  graphicsQuality: 'ultra',
  renderDistancePreset: 'extreme',
  audioVolume: 2,
  controlsHelp: false,
  debugOverlay: false,
  firstLaunchComplete: true,
});

const normalizedSettings = settingsSystem.getSnapshot();

assert.equal(normalizedSettings.graphicsQuality, GRAPHICS_QUALITY.medium);
assert.equal(normalizedSettings.renderDistancePreset, RENDER_DISTANCE_PRESETS.balanced);
assert.equal(normalizedSettings.audioVolume, 1);
assert.equal(normalizedSettings.controlsHelp, false);
assert.equal(normalizedSettings.debugOverlay, false);
assert.equal(normalizedSettings.firstLaunchComplete, true);

settingsSystem.updateSettings({
  graphicsQuality: GRAPHICS_QUALITY.low,
  renderDistancePreset: RENDER_DISTANCE_PRESETS.near,
  audioVolume: 0.35,
});

const reloadedSettingsSystem = new SettingsSystem({ storage });
const reloadedSettings = reloadedSettingsSystem.getSnapshot();

assert.equal(reloadedSettings.graphicsQuality, GRAPHICS_QUALITY.low);
assert.equal(reloadedSettings.renderDistancePreset, RENDER_DISTANCE_PRESETS.near);
assert.equal(reloadedSettings.audioVolume, 0.35);
assert.equal(reloadedSettings.renderDistance.loadRadius, 1);
assert.equal(reloadedSettings.graphics.shadows, false);

const legacyStorage = createMemoryStorage();
legacyStorage.setItem('godoyEngine.settings.v1', JSON.stringify({
  debugOverlay: true,
  controlsHelp: false,
}));
const migratedSettings = new SettingsSystem({ storage: legacyStorage }).getSnapshot();

assert.equal(migratedSettings.debugOverlay, false);
assert.equal(migratedSettings.controlsHelp, false);
assert.equal(migratedSettings.settingsVersion, 2);

console.log('smoke:settings ok');

function createMemoryStorage() {
  const entries = new Map();

  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  };
}
