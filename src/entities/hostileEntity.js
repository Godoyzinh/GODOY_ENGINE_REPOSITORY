import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { DAMAGE_TYPES } from '../combat/damageSystem.js';
import { BaseEntity } from './baseEntity.js';
import { ENTITY_TYPES } from './entityTypes.js';

const bodyGeometry = new BoxGeometry(0.78, 0.92, 0.68);
const headGeometry = new BoxGeometry(0.48, 0.42, 0.48);
const bodyMaterial = new MeshStandardMaterial({ color: '#7e3144', roughness: 0.88 });
const headMaterial = new MeshStandardMaterial({ color: '#b54b58', roughness: 0.82 });
const AGGRO_RANGE = 18;
const ATTACK_RANGE = 1.55;
const CHASE_SPEED = 2.65;
const WANDER_SPEED = 0.85;
const ATTACK_DAMAGE = 8;
const ATTACK_COOLDOWN_SECONDS = 1.15;

export class HostileEntity extends BaseEntity {
  constructor() {
    super({
      type: ENTITY_TYPES.hostile,
      name: 'HostileEntity',
    });

    this.state.maxHealth = 45;
    this.state.health = this.state.maxHealth;
    this.collider.radius = 0.45;
    this.collider.height = 1.25;
    this.collider.groundedOffset = 0.02;
    this.behavior = {
      state: 'idle',
      timer: 1,
      attackCooldown: 0,
      moveDirection: new Vector3(),
    };
    this.object.add(createHostileModel());
  }

  initialize({ position, seed = Math.random() } = {}) {
    super.initialize({ position });
    this.state.maxHealth = 45;
    this.state.health = this.state.maxHealth;
    this.seed = seed;
    this.behavior.state = 'idle';
    this.behavior.timer = 1 + Math.random() * 2;
    this.behavior.attackCooldown = 0;
    this.behavior.moveDirection.set(0, 0, 0);

    return this;
  }

  update(deltaTime, context) {
    this.behavior.attackCooldown = Math.max(0, this.behavior.attackCooldown - deltaTime);
    this.updateBehavior(deltaTime, context);
    this.applyBehaviorMovement(deltaTime);
    super.update(deltaTime, context);
  }

  updateBehavior(deltaTime, context) {
    const playerPosition = context.playerPosition;

    if (!playerPosition) {
      this.updateIdle(deltaTime);
      return;
    }

    const distanceToPlayer = this.transform.position.distanceTo(playerPosition);

    if (distanceToPlayer <= ATTACK_RANGE) {
      this.behavior.state = 'attack';
      this.attackPlayer(context.damageSystem);
      return;
    }

    if (distanceToPlayer <= AGGRO_RANGE) {
      this.behavior.state = 'chase';
      this.behavior.moveDirection
        .copy(playerPosition)
        .sub(this.transform.position)
        .setY(0)
        .normalize();
      return;
    }

    this.updateIdle(deltaTime);
  }

  updateIdle(deltaTime) {
    this.behavior.timer -= deltaTime;

    if (this.behavior.timer > 0) {
      return;
    }

    this.behavior.state = this.behavior.state === 'wander' ? 'idle' : 'wander';
    this.behavior.timer = 1.2 + Math.random() * 2.4;

    if (this.behavior.state === 'wander') {
      const angle = Math.random() * Math.PI * 2;
      this.behavior.moveDirection.set(Math.sin(angle), 0, Math.cos(angle)).normalize();
    } else {
      this.behavior.moveDirection.set(0, 0, 0);
    }
  }

  applyBehaviorMovement(deltaTime) {
    if (this.behavior.state !== 'chase' && this.behavior.state !== 'wander') {
      return;
    }

    const speed = this.behavior.state === 'chase' ? CHASE_SPEED : WANDER_SPEED;
    this.transform.position.addScaledVector(this.behavior.moveDirection, speed * deltaTime);

    if (this.behavior.moveDirection.lengthSq() > 0) {
      this.transform.rotation.y = Math.atan2(this.behavior.moveDirection.x, this.behavior.moveDirection.z);
    }
  }

  attackPlayer(damageSystem) {
    if (!damageSystem || this.behavior.attackCooldown > 0) {
      return;
    }

    const wasApplied = damageSystem.applyPlayerDamage({
      amount: ATTACK_DAMAGE,
      type: DAMAGE_TYPES.attack,
      source: this.id,
    });

    if (wasApplied) {
      this.behavior.attackCooldown = ATTACK_COOLDOWN_SECONDS;
    }
  }
}

function createHostileModel() {
  const model = new Group();
  const body = new Mesh(bodyGeometry, bodyMaterial);
  const head = new Mesh(headGeometry, headMaterial);

  body.position.y = 0.48;
  head.position.y = 1.08;
  body.castShadow = true;
  body.receiveShadow = true;
  head.castShadow = true;
  head.receiveShadow = true;
  model.add(body, head);

  return model;
}
