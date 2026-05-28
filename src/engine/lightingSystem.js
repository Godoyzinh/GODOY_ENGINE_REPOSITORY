import { AmbientLight, Color, DirectionalLight, Group, HemisphereLight, Object3D, Vector3 } from 'three';

export class LightingSystem {
  constructor() {
    this.group = new Group();
    this.group.name = 'LightingSystem';
    this.sunDirection = new Vector3();
    this.dayColor = new Color('#fff2d2');
    this.dawnColor = new Color('#ffd196');
    this.moonColor = new Color('#9fb7ff');

    this.hemisphereLight = new HemisphereLight('#d9ecff', '#586a49', 1.35);
    this.ambientLight = new AmbientLight('#ffffff', 0.35);
    this.sunLight = new DirectionalLight('#fff2d2', 3.2);
    this.sunTarget = new Object3D();
    this.sunLight.position.set(30, 45, 25);
    this.sunLight.target = this.sunTarget;
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 120;
    this.sunLight.shadow.camera.left = -62;
    this.sunLight.shadow.camera.right = 62;
    this.sunLight.shadow.camera.top = 62;
    this.sunLight.shadow.camera.bottom = -62;
    this.sunLight.shadow.bias = -0.00022;
    this.sunLight.shadow.normalBias = 0.018;

    this.group.add(this.hemisphereLight, this.ambientLight, this.sunTarget, this.sunLight);
  }

  update(dayNightSnapshot, weatherSnapshot = null, focusPosition = null) {
    if (!dayNightSnapshot) {
      return;
    }

    const daylight = dayNightSnapshot.daylight;
    const sunAngle = dayNightSnapshot.timeOfDay * Math.PI * 2;
    const dawnDusk = 1 - Math.abs(daylight - 0.5) * 2;
    const weatherDimming = 1 - (weatherSnapshot?.intensity ?? 0) * 0.28;
    const targetPosition = focusPosition ?? { x: 0, y: 0, z: 0 };

    this.hemisphereLight.intensity = (0.48 + daylight * 0.92) * weatherDimming;
    this.ambientLight.intensity = 0.16 + daylight * 0.28;
    this.sunLight.intensity = (0.25 + daylight * 3.05) * weatherDimming;
    this.sunLight.color
      .copy(dayNightSnapshot.isNight ? this.moonColor : this.dayColor)
      .lerp(this.dawnColor, dawnDusk * 0.22);
    this.sunTarget.position.set(targetPosition.x, targetPosition.y + 0.8, targetPosition.z);
    this.sunDirection.set(
      Math.cos(sunAngle) * 42,
      16 + Math.max(daylight, 0.12) * 42,
      Math.sin(sunAngle) * 42,
    );
    this.sunLight.position.copy(this.sunTarget.position).add(this.sunDirection);
  }
}
