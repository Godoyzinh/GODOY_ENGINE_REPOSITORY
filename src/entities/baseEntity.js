import { Group, Vector3 } from 'three';
import { getChunkKeyFromWorldPosition } from '../world/chunkMath.js';
import { ENTITY_COMBAT_STATES, ENTITY_STATES } from './entityTypes.js';

const DEFAULT_GRAVITY = -24;
const DEFAULT_MAX_FALL_SPEED = -32;
const HURT_SECONDS = 0.22;
const DAMAGE_FLASH_SECONDS = 0.16;
const DEATH_CLEANUP_SECONDS = 0.48;
const KNOCKBACK_DAMPING = 7;

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
      health: 100,
      maxHealth: 100,
      isActive: true,
      isVisible: true,
      chunkKey: '0,0',
      removeRequested: false,
      removeReason: null,
    };
    this.combat = {
      state: ENTITY_COMBAT_STATES.idle,
      hurtTimer: 0,
      damageFlashTimer: 0,
      deathTimer: 0,
      knockbackVelocity: new Vector3(),
      lastDamage: null,
      deathDropsSpawned: false,
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
    this.state.health = this.state.maxHealth;
    this.state.isActive = true;
    this.state.isVisible = true;
    this.state.removeRequested = false;
    this.state.removeReason = null;
    this.combat.state = ENTITY_COMBAT_STATES.idle;
    this.combat.hurtTimer = 0;
    this.combat.damageFlashTimer = 0;
    this.combat.deathTimer = 0;
    this.combat.knockbackVelocity.set(0, 0, 0);
    this.combat.lastDamage = null;
    this.combat.deathDropsSpawned = false;
    this.updateChunkKey();
    this.syncObjectTransform();

    return this;
  }

  update(deltaTime, context) {
    this.state.age += deltaTime;
    this.updateCombatState(deltaTime);

    if (this.state.removeRequested || !this.isAlive()) {
      this.syncObjectTransform();
      return;
    }

    if (this.physics.gravityEnabled) {
      this.applyGravity(deltaTime, context.terrainSampler);
    }

    this.updateChunkKey();
    this.syncObjectTransform();
  }

  updateCombatState(deltaTime) {
    if (this.combat.knockbackVelocity.lengthSq() > 0.0001) {
      this.transform.position.addScaledVector(this.combat.knockbackVelocity, deltaTime);
      this.combat.knockbackVelocity.multiplyScalar(Math.max(0, 1 - deltaTime * KNOCKBACK_DAMPING));
    }

    this.combat.damageFlashTimer = Math.max(0, this.combat.damageFlashTimer - deltaTime);
    this.combat.hurtTimer = Math.max(0, this.combat.hurtTimer - deltaTime);

    if (this.combat.state === ENTITY_COMBAT_STATES.hurt && this.combat.hurtTimer <= 0) {
      this.combat.state = ENTITY_COMBAT_STATES.idle;
    }

    if (this.combat.state !== ENTITY_COMBAT_STATES.death) {
      return;
    }

    this.combat.deathTimer -= deltaTime;

    if (this.combat.deathTimer <= 0) {
      this.requestRemoval('destroyed');
    }
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
    if (this.combat.state === ENTITY_COMBAT_STATES.death) {
      this.state.isActive = true;
      this.state.lifecycle = ENTITY_STATES.dying;
      return;
    }

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

  applyDamage({ amount, type = 'generic', source = null, knockback = null }) {
    if (this.state.removeRequested || !this.isAlive()) {
      return false;
    }

    this.state.health = Math.max(0, this.state.health - amount);
    this.combat.lastDamage = {
      amount,
      type,
      source,
    };
    this.state.lastDamage = this.combat.lastDamage;
    this.combat.hurtTimer = HURT_SECONDS;
    this.combat.damageFlashTimer = DAMAGE_FLASH_SECONDS;

    if (knockback) {
      this.combat.knockbackVelocity.copy(knockback);
    }

    if (this.state.health <= 0) {
      this.beginDeath(source);
    } else {
      this.combat.state = ENTITY_COMBAT_STATES.hurt;
    }

    return true;
  }

  beginDeath(source = null) {
    this.state.health = 0;
    this.state.lifecycle = ENTITY_STATES.dying;
    this.combat.state = ENTITY_COMBAT_STATES.death;
    this.combat.deathTimer = DEATH_CLEANUP_SECONDS;
    this.combat.lastDamage = {
      ...(this.combat.lastDamage ?? {}),
      source,
    };
  }

  isAlive() {
    return this.state.health > 0 && this.combat.state !== ENTITY_COMBAT_STATES.death;
  }

  getHealthPercent() {
    return this.state.maxHealth > 0 ? this.state.health / this.state.maxHealth : 0;
  }

  getDeathDrops() {
    return [];
  }

  getCombatSnapshot() {
    return {
      state: this.combat.state,
      health: this.state.health,
      maxHealth: this.state.maxHealth,
      healthPercent: this.getHealthPercent(),
      lastDamage: this.combat.lastDamage,
    };
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
    this.combat.state = ENTITY_COMBAT_STATES.idle;
    this.combat.hurtTimer = 0;
    this.combat.damageFlashTimer = 0;
    this.combat.deathTimer = 0;
    this.combat.knockbackVelocity.set(0, 0, 0);
    this.combat.lastDamage = null;
    this.combat.deathDropsSpawned = false;
  }
}
