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

  applyEnvironment(dayNightSnapshot) {
    if (!dayNightSnapshot) {
      return;
    }

    const daylight = dayNightSnapshot.daylight;
    const skyColor = daylight > 0.35 ? '#86b8f0' : '#17223b';
    const fogColor = daylight > 0.35 ? '#86b8f0' : '#101827';

    this.scene.background.set(skyColor);
    this.scene.fog.color.set(fogColor);
    this.scene.fog.near = dayNightSnapshot.isNight ? 32 : 45;
    this.scene.fog.far = dayNightSnapshot.isNight ? 110 : 140;
  }
}
