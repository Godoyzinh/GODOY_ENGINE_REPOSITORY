import { AmbientLight, DirectionalLight, Group, HemisphereLight } from 'three';

export class LightingSystem {
  constructor() {
    this.group = new Group();
    this.group.name = 'LightingSystem';

    this.hemisphereLight = new HemisphereLight('#d9ecff', '#586a49', 1.35);
    this.ambientLight = new AmbientLight('#ffffff', 0.35);
    this.sunLight = new DirectionalLight('#fff2d2', 3.2);
    this.sunLight.position.set(30, 45, 25);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 120;
    this.sunLight.shadow.camera.left = -55;
    this.sunLight.shadow.camera.right = 55;
    this.sunLight.shadow.camera.top = 55;
    this.sunLight.shadow.camera.bottom = -55;

    this.group.add(this.hemisphereLight, this.ambientLight, this.sunLight);
  }
}
