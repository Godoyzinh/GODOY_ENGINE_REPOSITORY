import { Color, Fog, Scene } from 'three';

export class SceneSystem {
  constructor() {
    this.scene = new Scene();
    this.scene.background = new Color('#86b8f0');
    this.scene.fog = new Fog('#86b8f0', 45, 140);
    this.updatables = new Set();
  }

  add(object) {
    this.scene.add(object);

    if (typeof object.update === 'function') {
      this.updatables.add(object);
    }
  }

  remove(object) {
    this.scene.remove(object);
    this.updatables.delete(object);
  }

  update(deltaTime, elapsedTime) {
    for (const updatable of this.updatables) {
      updatable.update(deltaTime, elapsedTime);
    }
  }

  applyEnvironment(dayNightSnapshot, weatherSnapshot = null) {
    if (!dayNightSnapshot) {
      return;
    }

    const daylight = dayNightSnapshot.daylight;
    const skyColor = new Color('#17223b').lerp(new Color('#86b8f0'), daylight);
    const fogColor = new Color('#101827').lerp(new Color('#9bcdf2'), daylight);
    const weatherIntensity = weatherSnapshot?.intensity ?? 0;
    const fogMultiplier = weatherSnapshot?.fogMultiplier ?? 1;
    const isRainOrFog = weatherSnapshot?.isRaining || weatherSnapshot?.isFoggy;

    if (isRainOrFog) {
      fogColor.lerp(new Color('#b8c5ce'), weatherIntensity * 0.28);
    }

    this.scene.background.copy(skyColor);
    this.scene.fog.color.copy(fogColor);
    this.scene.fog.near = (dayNightSnapshot.isNight ? 28 : 42) / fogMultiplier;
    this.scene.fog.far = (dayNightSnapshot.isNight ? 105 : 150) / fogMultiplier;
  }
}
