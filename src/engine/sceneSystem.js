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
}
