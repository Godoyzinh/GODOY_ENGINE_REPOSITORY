import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Points,
  PointsMaterial,
  Vector3,
} from 'three';

const DEFAULT_PARTICLE_COUNT = 96;
const PARTICLE_RADIUS = 34;
const PARTICLE_HEIGHT = 16;

export class AmbientParticleSystem {
  constructor({ particleCount = DEFAULT_PARTICLE_COUNT } = {}) {
    this.group = new Group();
    this.group.name = 'AmbientParticleSystem';
    this.particleCount = particleCount;
    this.positions = new Float32Array(particleCount * 3);
    this.colors = new Float32Array(particleCount * 3);
    this.seeds = Array.from({ length: particleCount }, (_, index) => index * 17.19 + Math.random() * 11);
    this.focusPosition = new Vector3();
    this.color = new Color('#ffe7a8');
    this.wind = new Vector3();

    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
    this.material = new PointsMaterial({
      size: 0.09,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      vertexColors: true,
    });
    this.points = new Points(this.geometry, this.material);
    this.points.name = 'AmbientParticles';
    this.points.frustumCulled = false;
    this.group.add(this.points);

    for (let index = 0; index < particleCount; index += 1) {
      this.resetParticle(index, new Vector3(), null, true);
    }

    this.snapshot = this.createSnapshot();
  }

  update({
    deltaTime,
    elapsedTime,
    focusPosition,
    weatherSnapshot = null,
    dayNightSnapshot = null,
    terrainStats = null,
  }) {
    if (!focusPosition) {
      return;
    }

    this.focusPosition.copy(focusPosition);
    this.updateMaterial(weatherSnapshot, dayNightSnapshot);
    this.wind.set(
      Math.sin(elapsedTime * 0.23) * 0.34,
      0,
      Math.cos(elapsedTime * 0.19) * 0.28,
    );

    for (let index = 0; index < this.particleCount; index += 1) {
      this.updateParticle(index, deltaTime, elapsedTime, weatherSnapshot);
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.snapshot = this.createSnapshot(weatherSnapshot, terrainStats);
  }

  updateParticle(index, deltaTime, elapsedTime, weatherSnapshot) {
    const positionIndex = index * 3;
    const isRaining = weatherSnapshot?.isRaining === true;
    const drift = isRaining ? 2.2 : 0.75;
    const fallSpeed = isRaining ? 18 : 0.28 + (this.seeds[index] % 4) * 0.04;

    this.positions[positionIndex] += (this.wind.x + Math.sin(elapsedTime + this.seeds[index]) * 0.08) * deltaTime * drift;
    this.positions[positionIndex + 1] -= fallSpeed * deltaTime;
    this.positions[positionIndex + 2] += (this.wind.z + Math.cos(elapsedTime * 0.7 + this.seeds[index]) * 0.08) * deltaTime * drift;

    const distanceX = Math.abs(this.positions[positionIndex] - this.focusPosition.x);
    const distanceZ = Math.abs(this.positions[positionIndex + 2] - this.focusPosition.z);
    const belowFocus = this.positions[positionIndex + 1] < this.focusPosition.y - 2;

    if (distanceX > PARTICLE_RADIUS || distanceZ > PARTICLE_RADIUS || belowFocus) {
      this.resetParticle(index, this.focusPosition, weatherSnapshot);
    }
  }

  resetParticle(index, focusPosition, weatherSnapshot, initial = false) {
    const positionIndex = index * 3;
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * PARTICLE_RADIUS;
    const verticalOffset = weatherSnapshot?.isRaining
      ? 6 + Math.random() * PARTICLE_HEIGHT
      : Math.random() * PARTICLE_HEIGHT - 2;

    this.positions[positionIndex] = focusPosition.x + Math.cos(angle) * radius;
    this.positions[positionIndex + 1] = focusPosition.y + verticalOffset + (initial ? Math.random() * 8 : 0);
    this.positions[positionIndex + 2] = focusPosition.z + Math.sin(angle) * radius;
    this.writeParticleColor(index, weatherSnapshot);
  }

  updateMaterial(weatherSnapshot, dayNightSnapshot) {
    if (weatherSnapshot?.isRaining) {
      this.material.size = 0.055;
      this.material.opacity = 0.5;
      this.color.set('#a8d9ff');
    } else if (weatherSnapshot?.isFoggy) {
      this.material.size = 0.13;
      this.material.opacity = 0.24;
      this.color.set('#d8e6ff');
    } else {
      this.material.size = 0.085;
      this.material.opacity = dayNightSnapshot?.isNight ? 0.18 : 0.34;
      this.color.set(dayNightSnapshot?.isNight ? '#b9caff' : '#ffe7a8');
    }
  }

  writeParticleColor(index, weatherSnapshot) {
    const colorIndex = index * 3;
    const brightness = weatherSnapshot?.isRaining ? 0.82 : 0.72 + Math.random() * 0.28;
    const particleColor = this.color.clone().multiplyScalar(brightness);

    this.colors[colorIndex] = particleColor.r;
    this.colors[colorIndex + 1] = particleColor.g;
    this.colors[colorIndex + 2] = particleColor.b;
  }

  createSnapshot(weatherSnapshot = null, terrainStats = null) {
    return {
      activeParticles: this.particleCount,
      particleMode: weatherSnapshot?.state ?? 'clear',
      biome: terrainStats?.activeBiome ?? 'Plains',
    };
  }

  getSnapshot() {
    return this.snapshot;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
