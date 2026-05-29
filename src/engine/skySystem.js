import {
  BackSide,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';

const SKY_RADIUS = 420;
const CELESTIAL_DISTANCE = 250;
const skyGeometry = new SphereGeometry(SKY_RADIUS, 32, 16);
const sunGeometry = new SphereGeometry(7, 16, 8);
const moonGeometry = new SphereGeometry(4.2, 16, 8);

export class SkySystem {
  constructor() {
    this.group = new Group();
    this.group.name = 'SkySystem';
    this.group.frustumCulled = false;

    this.topColor = new Color('#5bb8ff');
    this.horizonColor = new Color('#dff5ff');
    this.bottomColor = new Color('#8fcaee');
    this.sunDirection = new Vector3();
    this.moonDirection = new Vector3();

    this.skyMaterial = new ShaderMaterial({
      uniforms: {
        topColor: { value: this.topColor },
        horizonColor: { value: this.horizonColor },
        bottomColor: { value: this.bottomColor },
        gradientPower: { value: 1.35 },
      },
      vertexShader: `
        varying vec3 vDirection;

        void main() {
          vDirection = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        uniform float gradientPower;
        varying vec3 vDirection;

        void main() {
          float height = normalize(vDirection).y * 0.5 + 0.5;
          vec3 lowerSky = mix(bottomColor, horizonColor, smoothstep(0.0, 0.55, height));
          vec3 upperSky = mix(horizonColor, topColor, pow(height, gradientPower));
          gl_FragColor = vec4(mix(lowerSky, upperSky, smoothstep(0.38, 1.0, height)), 1.0);
        }
      `,
      side: BackSide,
      depthWrite: false,
      fog: false,
    });

    this.skyMesh = new Mesh(skyGeometry, this.skyMaterial);
    this.skyMesh.name = 'SkyGradient';
    this.skyMesh.frustumCulled = false;

    this.sunMaterial = new MeshBasicMaterial({
      color: '#ffe6a5',
      transparent: true,
      opacity: 1,
      depthWrite: false,
      fog: false,
    });
    this.moonMaterial = new MeshBasicMaterial({
      color: '#d9e4ff',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });

    this.sun = new Mesh(sunGeometry, this.sunMaterial);
    this.sun.name = 'SkySun';
    this.sun.frustumCulled = false;

    this.moon = new Mesh(moonGeometry, this.moonMaterial);
    this.moon.name = 'SkyMoon';
    this.moon.frustumCulled = false;

    this.group.add(this.skyMesh, this.sun, this.moon);
    this.snapshot = this.createSnapshot();
  }

  update({ dayNightSnapshot, weatherSnapshot = null, cameraPosition = null }) {
    if (!dayNightSnapshot) {
      return;
    }

    if (cameraPosition) {
      this.group.position.copy(cameraPosition);
    }

    const daylight = dayNightSnapshot.daylight;
    const weatherIntensity = weatherSnapshot?.intensity ?? 0;
    const dawnDusk = 1 - Math.abs(daylight - 0.5) * 2;
    const stormDim = 1 - weatherIntensity * 0.24;
    const topDay = new Color('#58b8ff');
    const horizonDay = new Color('#e1f7ff');
    const bottomDay = new Color('#9bd9ff');
    const topNight = new Color('#071126');
    const horizonNight = new Color('#1e315f');
    const bottomNight = new Color('#0d172e');
    const warmHorizon = new Color('#ffc06d');

    this.topColor.lerpColors(topNight, topDay, daylight * stormDim);
    this.horizonColor.lerpColors(horizonNight, horizonDay, daylight * stormDim);
    this.horizonColor.lerp(warmHorizon, dawnDusk * 0.24 * (1 - weatherIntensity));
    this.bottomColor.lerpColors(bottomNight, bottomDay, daylight * stormDim);
    this.skyMaterial.uniforms.gradientPower.value = 1.15 + weatherIntensity * 0.45;

    this.resolveCelestialDirections(dayNightSnapshot.timeOfDay);
    this.sun.position.copy(this.sunDirection).multiplyScalar(CELESTIAL_DISTANCE);
    this.moon.position.copy(this.moonDirection).multiplyScalar(CELESTIAL_DISTANCE);
    this.sunMaterial.opacity = clamp(daylight * 1.35 - weatherIntensity * 0.28, 0, 1);
    this.moonMaterial.opacity = clamp((1 - daylight) * 1.2, 0, 0.86);
    this.snapshot = this.createSnapshot(dayNightSnapshot, weatherSnapshot);
  }

  resolveCelestialDirections(timeOfDay) {
    const orbitAngle = timeOfDay * Math.PI * 2;

    this.sunDirection.set(
      Math.cos(orbitAngle) * 0.45,
      Math.sin(orbitAngle),
      Math.sin(orbitAngle * 0.55) * 0.32,
    ).normalize();
    this.moonDirection.copy(this.sunDirection).multiplyScalar(-1);
  }

  createSnapshot(dayNightSnapshot = null, weatherSnapshot = null) {
    return {
      daylight: dayNightSnapshot?.daylight ?? 1,
      sunOpacity: this.sunMaterial.opacity,
      moonOpacity: this.moonMaterial.opacity,
      weatherState: weatherSnapshot?.state ?? 'clear',
    };
  }

  getSnapshot() {
    return this.snapshot;
  }

  dispose() {
    this.skyMaterial.dispose();
    this.sunMaterial.dispose();
    this.moonMaterial.dispose();
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
