import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Vector3,
} from 'three';

const MAX_PARTICLES = 160;
const particleGeometry = new BoxGeometry(0.12, 0.12, 0.12);

export class FeedbackParticleSystem {
  constructor({ maxParticles = MAX_PARTICLES } = {}) {
    this.group = new Group();
    this.group.name = 'FeedbackParticleSystem';
    this.maxParticles = maxParticles;
    this.matrix = new Matrix4();
    this.color = new Color();
    this.particles = Array.from({ length: maxParticles }, () => createInactiveParticle());
    this.material = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      fog: true,
    });
    this.mesh = new InstancedMesh(particleGeometry, this.material, maxParticles);
    this.mesh.name = 'VoxelFeedbackParticles';
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.snapshot = this.createSnapshot();
  }

  emitBlockBreak({ position, blockDefinition }) {
    this.emitBurst({
      position,
      color: blockDefinition?.color ?? '#f0d090',
      count: 12,
      power: 2.4,
      verticalBoost: 2.2,
    });
  }

  emitHit({ position, color = '#ff9c7a' }) {
    this.emitBurst({
      position,
      color,
      count: 10,
      power: 3.2,
      verticalBoost: 1.4,
    });
  }

  emitLanding({ position, intensity = 1 }) {
    this.emitBurst({
      position: {
        x: position.x,
        y: position.y + 0.08,
        z: position.z,
      },
      color: '#d8c08a',
      count: Math.round(6 + intensity * 6),
      power: 1.8 + intensity,
      verticalBoost: 0.55,
    });
  }

  emitBurst({ position, color, count, power, verticalBoost }) {
    const origin = toVector3(position);

    for (let countIndex = 0; countIndex < count; countIndex += 1) {
      const particle = this.getWritableParticle();
      const angle = Math.random() * Math.PI * 2;
      const horizontalPower = (0.35 + Math.random() * 0.65) * power;

      particle.position.copy(origin);
      particle.velocity.set(
        Math.cos(angle) * horizontalPower,
        verticalBoost + Math.random() * power,
        Math.sin(angle) * horizontalPower,
      );
      particle.age = 0;
      particle.lifetime = 0.38 + Math.random() * 0.34;
      particle.size = 0.08 + Math.random() * 0.08;
      particle.color.set(color);
    }
  }

  update(deltaTime) {
    let activeCount = 0;

    for (const particle of this.particles) {
      if (particle.age >= particle.lifetime) {
        continue;
      }

      particle.age += deltaTime;
      particle.velocity.y -= 8.5 * deltaTime;
      particle.position.addScaledVector(particle.velocity, deltaTime);

      if (particle.age >= particle.lifetime) {
        continue;
      }

      const lifetimePercent = particle.age / particle.lifetime;
      const scale = particle.size * (1 - lifetimePercent * 0.68);

      this.matrix.makeScale(scale, scale, scale);
      this.matrix.setPosition(particle.position);
      this.mesh.setMatrixAt(activeCount, this.matrix);
      this.color.copy(particle.color).multiplyScalar(1 - lifetimePercent * 0.42);
      this.mesh.setColorAt(activeCount, this.color);
      activeCount += 1;
    }

    this.mesh.count = activeCount;
    this.mesh.instanceMatrix.needsUpdate = true;

    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }

    this.snapshot = this.createSnapshot(activeCount);
  }

  getWritableParticle() {
    const inactiveParticle = this.particles.find((particle) => particle.age >= particle.lifetime);

    if (inactiveParticle) {
      return inactiveParticle;
    }

    return this.particles.reduce((oldest, particle) => (
      particle.age > oldest.age ? particle : oldest
    ), this.particles[0]);
  }

  createSnapshot(activeParticles = 0) {
    return {
      activeParticles,
      maxParticles: this.maxParticles,
    };
  }

  getSnapshot() {
    return this.snapshot;
  }

  dispose() {
    this.material.dispose();
  }
}

function createInactiveParticle() {
  return {
    position: new Vector3(),
    velocity: new Vector3(),
    color: new Color('#ffffff'),
    age: 1,
    lifetime: 1,
    size: 0.1,
  };
}

function toVector3(position) {
  if (position instanceof Vector3) {
    return position.clone();
  }

  return new Vector3(position.x, position.y, position.z);
}
