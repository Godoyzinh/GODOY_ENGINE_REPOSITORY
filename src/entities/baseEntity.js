import { Group, Vector3 } from 'three';
import { getChunkKeyFromWorldPosition } from '../world/chunkMath.js';
import { ENTITY_STATES } from './entityTypes.js';

const DEFAULT_GRAVITY = -24;
const DEFAULT_MAX_FALL_SPEED = -32;

let nextEntityId = 1;

export class BaseEntity {
  constructor({ type, name }) {
    this.id = `entity-${nextEntityId}`;
    nextEntityId += 1;
    this.type = type;
    this.name = name;
    this.object = new Group();
    this.object.name = name;
    this.transform = {
      position: new Vector3(),
      rotation: new Vector3(),
      scale: new Vector3(1, 1, 1),
    };
    this.velocity = new Vector3();
    this.collider = {
      radius: 0.4,
      height: 1,
      groundedOffset: 0,
    };
    this.physics = {
      gravityEnabled: true,
      collisionReady: true,
      gravity: DEFAULT_GRAVITY,
      maxFallSpeed: DEFAULT_MAX_FALL_SPEED,
    };
    this.state = {
      lifecycle: ENTITY_STATES.active,
      age: 0,
      isActive: true,
      isVisible: true,
      chunkKey: '0,0',
      removeRequested: false,
      removeReason: null,
    };
  }

  initialize({ id = null, position = null } = {}) {
    this.id = id ?? this.id;
    this.transform.position.copy(position ?? new Vector3());
    this.transform.rotation.set(0, 0, 0);
    this.transform.scale.set(1, 1, 1);
    this.velocity.set(0, 0, 0);
    this.state.lifecycle = ENTITY_STATES.active;
    this.state.age = 0;
    this.state.isActive = true;
    this.state.isVisible = true;
    this.state.removeRequested = false;
    this.state.removeReason = null;
    this.updateChunkKey();
    this.syncObjectTransform();

    return this;
  }

  update(deltaTime, context) {
    this.state.age += deltaTime;

    if (this.physics.gravityEnabled) {
      this.applyGravity(deltaTime, context.terrainSampler);
    }

    this.updateChunkKey();
    this.syncObjectTransform();
  }

  applyGravity(deltaTime, terrainSampler) {
    if (!terrainSampler) {
      return;
    }

    const position = this.transform.position;
    const groundHeight = terrainSampler.getHeightAt(position.x, position.z);
    const minimumY = groundHeight + this.collider.groundedOffset;

    this.velocity.y = Math.max(
      this.velocity.y + this.physics.gravity * deltaTime,
      this.physics.maxFallSpeed,
    );
    position.y += this.velocity.y * deltaTime;

    if (position.y <= minimumY && this.velocity.y <= 0) {
      position.y = minimumY;
      this.velocity.y = 0;
    }
  }

  setSimulationActive(isActive) {
    this.state.isActive = isActive;
    this.state.lifecycle = isActive ? ENTITY_STATES.active : ENTITY_STATES.inactive;
  }

  setVisible(isVisible) {
    this.state.isVisible = isVisible;
    this.object.visible = isVisible;
  }

  requestRemoval(reason = 'despawned') {
    this.state.removeRequested = true;
    this.state.removeReason = reason;
    this.state.lifecycle = ENTITY_STATES.despawned;
  }

  getDistanceTo(position) {
    return this.transform.position.distanceTo(position);
  }

  updateChunkKey() {
    this.state.chunkKey = getChunkKeyFromWorldPosition(this.transform.position);
  }

  syncObjectTransform() {
    this.object.position.copy(this.transform.position);
    this.object.rotation.set(
      this.transform.rotation.x,
      this.transform.rotation.y,
      this.transform.rotation.z,
    );
    this.object.scale.copy(this.transform.scale);
  }

  prepareForReuse() {
    this.object.visible = false;
    this.state.lifecycle = ENTITY_STATES.inactive;
    this.state.isActive = false;
    this.state.isVisible = false;
    this.state.removeRequested = false;
    this.state.removeReason = null;
  }
}
